import { describe, expect, it } from 'vitest'
import {
  INITIAL_STARTER_PROMPTS,
  SUGGESTION_COUNT,
  buildSuggestionMessages,
  parseSuggestionLabels,
} from './suggestions.ts'

describe('INITIAL_STARTER_PROMPTS', () => {
  it('offers two gateway starters', () => {
    expect(INITIAL_STARTER_PROMPTS).toEqual(['調べ物を手伝って', 'アイデアが欲しい'])
  })
})

describe('parseSuggestionLabels', () => {
  it('parses a JSON array of two strings', () => {
    expect(parseSuggestionLabels('["次は東京の天気を調べて","関連する本を教えて"]')).toEqual([
      '次は東京の天気を調べて',
      '関連する本を教えて',
    ])
  })

  it('parses JSON object with suggestions key', () => {
    expect(
      parseSuggestionLabels('{"suggestions":["案Aを深掘りして","別の切り口を出して"]}'),
    ).toEqual(['案Aを深掘りして', '別の切り口を出して'])
  })

  it('extracts JSON embedded in prose / fences', () => {
    const raw = '候補です:\n```json\n["短い続き1","短い続き2"]\n```'
    expect(parseSuggestionLabels(raw)).toEqual(['短い続き1', '短い続き2'])
  })

  it('trims and keeps only the first two non-empty labels', () => {
    expect(parseSuggestionLabels('["  a  ","","b","c"]')).toEqual(['a', 'b'])
  })

  it('returns null when fewer than two usable labels', () => {
    expect(parseSuggestionLabels('["only one"]')).toBeNull()
    expect(parseSuggestionLabels('not json')).toBeNull()
    expect(parseSuggestionLabels('')).toBeNull()
  })

  it('clips overly long labels for the glasses menu', () => {
    const long = 'あ'.repeat(80)
    const parsed = parseSuggestionLabels(JSON.stringify([long, '短い']))
    expect(parsed).not.toBeNull()
    expect(parsed![0]!.length).toBeLessThan(long.length)
    expect(parsed![0]!.endsWith('…')).toBe(true)
    expect(parsed![1]).toBe('短い')
  })
})

describe('buildSuggestionMessages', () => {
  it('asks for exactly SUGGESTION_COUNT short Japanese follow-ups', () => {
    const msgs = buildSuggestionMessages([
      { role: 'user', content: '調べ物を手伝って' },
      { role: 'assistant', content: '何を調べますか？' },
    ])
    expect(msgs[0]?.role).toBe('system')
    expect(msgs[0]?.content).toContain(String(SUGGESTION_COUNT))
    expect(msgs[msgs.length - 1]?.role).toBe('user')
    expect(msgs[msgs.length - 1]?.content).toMatch(/JSON/)
  })
})

describe('requestSuggestionLabels', () => {
  it('returns parsed labels from createChatCompletion', async () => {
    const { requestSuggestionLabels } = await import('./suggestions.ts')
    const labels = await requestSuggestionLabels(
      {
        createChatCompletion: async () => ({
          choices: [{ message: { content: '["続きA","続きB"]' } }],
        }),
      },
      'gemma-4-e2b',
      [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'y' }],
    )
    expect(labels).toEqual(['続きA', '続きB'])
  })

  it('returns null when the model output is unusable', async () => {
    const { requestSuggestionLabels } = await import('./suggestions.ts')
    await expect(
      requestSuggestionLabels(
        {
          createChatCompletion: async () => ({
            choices: [{ message: { content: 'sorry no' } }],
          }),
        },
        'm',
        [],
      ),
    ).resolves.toBeNull()
  })
})
