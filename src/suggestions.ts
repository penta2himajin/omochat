import type { ChatMessage } from './openai/client.ts'

export const SUGGESTION_COUNT = 2

/** Cold-start menu: category gateways (no on-device generation). */
export const INITIAL_STARTER_PROMPTS = ['調べ物を手伝って', 'アイデアが欲しい'] as const

/** Max chars per menu label (glasses width; ellipsis appended when clipped). */
export const SUGGESTION_LABEL_MAX_CHARS = 28

export const SUGGESTION_SYSTEM_PROMPT = [
  'You propose the next user replies for a wearable glasses chat UI.',
  `Return exactly ${SUGGESTION_COUNT} short Japanese suggestions.`,
  'Each suggestion must be one brief tap target the user would send next.',
  'Match the conversation; do not repeat the last user message.',
  'No numbering, no explanation — JSON only.',
].join(' ')

function clipLabel(label: string): string {
  const t = label.replace(/\s+/g, ' ').trim()
  if (t.length <= SUGGESTION_LABEL_MAX_CHARS) return t
  return `${t.slice(0, Math.max(1, SUGGESTION_LABEL_MAX_CHARS - 1))}…`
}

function normalizeLabels(raw: unknown): string[] | null {
  let list: unknown[] | null = null
  if (Array.isArray(raw)) list = raw
  else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    const cand = obj.suggestions ?? obj.prompts ?? obj.options ?? obj.s
    if (Array.isArray(cand)) list = cand
  }
  if (!list) return null

  const labels: string[] = []
  for (const item of list) {
    if (typeof item !== 'string') continue
    const clipped = clipLabel(item)
    if (!clipped) continue
    labels.push(clipped)
    if (labels.length >= SUGGESTION_COUNT) break
  }
  return labels.length >= SUGGESTION_COUNT ? labels.slice(0, SUGGESTION_COUNT) : null
}

/** Pull the first JSON array/object from model output and normalize to 2 labels. */
export function parseSuggestionLabels(text: string): string[] | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const tryParse = (s: string): string[] | null => {
    try {
      return normalizeLabels(JSON.parse(s) as unknown)
    } catch {
      return null
    }
  }

  const direct = tryParse(trimmed)
  if (direct) return direct

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) {
    const fromFence = tryParse(fence[1].trim())
    if (fromFence) return fromFence
  }

  const arrayStart = trimmed.indexOf('[')
  const arrayEnd = trimmed.lastIndexOf(']')
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    const fromArray = tryParse(trimmed.slice(arrayStart, arrayEnd + 1))
    if (fromArray) return fromArray
  }

  const objStart = trimmed.indexOf('{')
  const objEnd = trimmed.lastIndexOf('}')
  if (objStart >= 0 && objEnd > objStart) {
    const fromObj = tryParse(trimmed.slice(objStart, objEnd + 1))
    if (fromObj) return fromObj
  }

  return null
}

export function buildSuggestionMessages(
  conversation: Array<{ role: 'user' | 'assistant'; content: string }>,
): ChatMessage[] {
  const recent = conversation.slice(-6)
  const transcript = recent
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n')

  return [
    { role: 'system', content: SUGGESTION_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        'Conversation so far:',
        transcript || '(empty)',
        '',
        `Reply with JSON only: a ${SUGGESTION_COUNT}-element string array of next user taps.`,
        'Example: ["短い候補1","短い候補2"]',
      ].join('\n'),
    },
  ]
}

export type SuggestionClient = {
  createChatCompletion: (params: {
    model: string
    messages: ChatMessage[]
    temperature?: number
    max_tokens?: number
  }) => Promise<{ choices: Array<{ message?: { content?: string } }> }>
}

/** Non-streaming follow-up call; returns null on parse/API failure. */
export async function requestSuggestionLabels(
  client: SuggestionClient,
  model: string,
  conversation: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<string[] | null> {
  try {
    const res = await client.createChatCompletion({
      model,
      messages: buildSuggestionMessages(conversation),
      temperature: 0.8,
      max_tokens: 128,
    })
    const raw = res.choices[0]?.message?.content ?? ''
    return parseSuggestionLabels(raw)
  } catch {
    return null
  }
}
