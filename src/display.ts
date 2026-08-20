import { getTextWidth } from '@evenrealities/pretext'
import { phaseLabel, type AppError } from './errors.ts'
import type { EnvProbeResult } from './env/probe.ts'
import type { CompanionProbeResult } from './companion/probe.ts'
import {
  buildTitleSeparator,
  clipByPixels,
  GLASSES_CONTENT_WIDTH,
  GLASSES_VIEWPORT_LINES,
  wrapByPixels,
} from './glassesLayout.ts'

export {
  GLASSES_BORDER_WIDTH,
  GLASSES_CANVAS_HEIGHT,
  GLASSES_CANVAS_WIDTH,
  GLASSES_CONTENT_HEIGHT,
  GLASSES_CONTENT_WIDTH,
  GLASSES_LINE_HEIGHT_PX,
  GLASSES_PADDING_LENGTH,
  GLASSES_VIEWPORT_LINES,
  buildTitleSeparator,
  clipByPixels,
  wrapByPixels,
} from './glassesLayout.ts'

export const APP_VERSION = '0.0.21'
/** Total TextContainer budget (Even Hub upgrade limit is ~2000). */
export const TEXT_UPGRADE_MAX = 2000
/** Full-width rule under the title; sized to the firmware content box. */
export const TITLE_SEPARATOR = buildTitleSeparator()
/**
 * header(2) + blank(1) + footer(2) reserved in history chrome.
 * (History pages themselves use a char budget; this remains for layout math.)
 */
export const HISTORY_BODY_MAX_LINES = GLASSES_VIEWPORT_LINES - 5
/**
 * Selection body (last turn): fill everything above the pinned menu.
 * header(2) + blank(1) + menu(3) reserved → remainder for the turn.
 * Must stay within GLASSES_VIEWPORT_LINES (10) or the firmware shows a scrollbar.
 * Overflow ends with … (read the rest in history mode).
 */
export const SELECTION_BODY_MAX_LINES = GLASSES_VIEWPORT_LINES - 6
/** Max turns shown above the menu in selection mode. */
export const SELECTION_PREVIEW_MAX_TURNS = 1
/** Marks that this history page continues from the previous page. */
export const HISTORY_CONTINUATION_PREFIX = '…'

/** @deprecated Column heuristic; use GLASSES_CONTENT_WIDTH / getTextWidth. */
export const GLASSES_LINE_COLUMNS = 46

/** Chars reserved for header + footer so each history page stays under TEXT_UPGRADE_MAX. */
export function historyChromeReserve(): number {
  const header = `omochat v${APP_VERSION}\n${TITLE_SEPARATOR}`.length
  const footer = `\n\nhistory 999/999\nswipe: page · double: menu`.length
  return header + footer
}

/** Default body char budget for one history page (Hub TextContainer limit minus chrome). */
export function historyBodyMaxChars(): number {
  return Math.max(32, TEXT_UPGRADE_MAX - historyChromeReserve())
}

export type Mode = 'loading' | 'idle' | 'thinking' | 'error'
export type ViewMode = 'selection' | 'history'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

export type LoadingStep = 'env-probe' | 'companion-probe' | 'api-config' | 'done'

export type MenuItem = {
  id: string
  label: string
  kind: 'prompt' | 'mic'
}

export const MIC_MENU_ID = 'mic'

export type DisplayState = {
  mode: Mode
  viewMode: ViewMode
  selectedMenuIndex: number
  menuItems: MenuItem[]
  messages: ChatMessage[]
  /** Index into paginateHistory() page bodies; clamped by formatter. */
  historyPageIndex: number
  streamingTail: string
  loadingStep?: LoadingStep
  env: EnvProbeResult
  companion: CompanionProbeResult
  modelLabel: string
  chatReady: boolean
  probeOnly: boolean
  companionProbe: boolean
  notice?: string
  error?: AppError
}

/** East Asian / fullwidth code points count as 2 columns (wcwidth-ish). */
export function isWideCodePoint(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    cp === 0x2329 ||
    cp === 0x232a ||
    (cp >= 0x2500 && cp <= 0x257f) || // box drawing (title rule ━ etc.)
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  )
}

export function displayWidth(text: string): number {
  let w = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    w += isWideCodePoint(cp) ? 2 : 1
  }
  return w
}

/** Clip by display columns without splitting surrogate pairs / code points. */
export function clipDisplay(text: string, maxColumns: number): string {
  if (maxColumns <= 0) return ''
  if (displayWidth(text) <= maxColumns) return text
  const ellipsisCols = 1
  const budget = Math.max(0, maxColumns - ellipsisCols)
  let w = 0
  let out = ''
  for (const ch of text) {
    const cw = isWideCodePoint(ch.codePointAt(0)!) ? 2 : 1
    if (w + cw > budget) break
    out += ch
    w += cw
  }
  return `${out}…`
}

export function buildMenuItems(prompts: string[]): MenuItem[] {
  return [
    ...prompts.map((label, i) => ({ id: `prompt-${i}`, label, kind: 'prompt' as const })),
    {
      id: MIC_MENU_ID,
      label: 'tap: mic input (not implemented)',
      kind: 'mic',
    },
  ]
}

export function formatMessageLine(msg: ChatMessage, maxPx = GLASSES_CONTENT_WIDTH): string {
  const prefix = msg.role === 'user' ? 'You: ' : 'AI: '
  const prefixW = getTextWidth(prefix)
  return prefix + clipByPixels(msg.content.replace(/\s+/g, ' ').trim(), Math.max(24, maxPx - prefixW))
}

/** Wrap a message across multiple lines (prefix on the first line only). */
export function wrapMessageLines(msg: ChatMessage, maxPx = GLASSES_CONTENT_WIDTH): string[] {
  const prefix = msg.role === 'user' ? 'You: ' : 'AI: '
  const body = msg.content.replace(/\s+/g, ' ').trim()
  return wrapByPixels(prefix + body, maxPx)
}

/** @deprecated Prefer wrapByPixels (firmware glyph metrics). */
export function wrapByColumns(text: string, _maxColumns: number = GLASSES_LINE_COLUMNS): string[] {
  return wrapByPixels(text.replace(/\s+/g, ' ').trim(), GLASSES_CONTENT_WIDTH)
}

/** Keep at most `maxLines`; if truncated, end the last kept line with …. */
export function fitLinesWithEllipsis(
  lines: string[],
  maxLines: number,
  maxPx: number = GLASSES_CONTENT_WIDTH,
): string[] {
  if (maxLines <= 0) return []
  if (lines.length <= maxLines) return lines
  const out = lines.slice(0, maxLines)
  const last = (out[maxLines - 1] ?? '').replace(/…$/u, '')
  // Always reserve room for … so truncation is visible even when the last line was full-width.
  const ellipsis = '…'
  const chars = Array.from(last)
  let lo = 0
  let hi = chars.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (getTextWidth(chars.slice(0, mid).join('') + ellipsis) <= maxPx) lo = mid
    else hi = mid - 1
  }
  out[maxLines - 1] = chars.slice(0, lo).join('') + ellipsis
  return out
}

/** Group into user(+assistant) turns for paging. */
export function messagesToTurns(messages: ChatMessage[]): ChatMessage[][] {
  const turns: ChatMessage[][] = []
  let i = 0
  while (i < messages.length) {
    const turn: ChatMessage[] = []
    if (messages[i]!.role === 'user') {
      turn.push(messages[i++]!)
      if (i < messages.length && messages[i]!.role === 'assistant') {
        turn.push(messages[i++]!)
      }
    } else {
      turn.push(messages[i++]!)
    }
    turns.push(turn)
  }
  return turns
}

function turnWrappedLines(turn: ChatMessage[]): string[] {
  const lines: string[] = []
  for (const m of turn) lines.push(...wrapMessageLines(m))
  return lines
}

/**
 * Pack history into page bodies by character budget (Hub TextContainer limit).
 * Multiple turns share a page until the budget is full; overflow continues on the
 * next page ending with … and starting with ….
 * Returns oldest→newest page body strings; empty history → one empty page.
 */
export function paginateHistory(
  messages: ChatMessage[],
  maxBodyChars: number = historyBodyMaxChars(),
): string[] {
  if (messages.length === 0) return ['']

  const stream = messages.flatMap((m) => wrapMessageLines(m)).join('\n')
  if (!stream) return ['']

  const pages: string[] = []
  let offset = 0
  let continuation = false

  while (offset < stream.length) {
    const prefix = continuation ? HISTORY_CONTINUATION_PREFIX : ''
    const restLen = stream.length - offset
    if (prefix.length + restLen <= maxBodyChars) {
      pages.push(prefix + stream.slice(offset))
      break
    }

    // Leave one char for trailing …
    const budget = maxBodyChars - prefix.length - 1
    if (budget <= 0) {
      pages.push((prefix + '…').slice(0, maxBodyChars))
      break
    }

    let take = budget
    const window = stream.slice(offset, offset + take)
    const lastNl = window.lastIndexOf('\n')
    // Prefer a line break when it still leaves a useful chunk.
    if (lastNl > 0 && lastNl >= Math.floor(budget * 0.4)) {
      take = lastNl
    }
    if (take <= 0) take = Math.min(budget, stream.length - offset)

    pages.push(prefix + stream.slice(offset, offset + take) + '…')
    offset += take
    if (stream[offset] === '\n') offset += 1
    continuation = true
  }

  return pages.length > 0 ? pages : ['']
}

function headerLines(version: string): string[] {
  return [`omochat v${version}`, TITLE_SEPARATOR]
}

/** Last turn only, wrapped + line-budget clipped with trailing …. */
export function formatLastTurnPreview(
  messages: ChatMessage[],
  streamingTail: string,
  maxLines: number = SELECTION_BODY_MAX_LINES,
): string[] {
  const list =
    streamingTail.length > 0
      ? [...messages, { role: 'assistant' as const, content: streamingTail }]
      : messages
  const turns = messagesToTurns(list)
  const last = turns[turns.length - 1]
  if (!last || last.length === 0) return []
  return fitLinesWithEllipsis(turnWrappedLines(last), maxLines)
}

function formatMenu(items: MenuItem[], selectedIndex: number): string[] {
  return items.map((item, i) => {
    const mark = i === selectedIndex ? '▶︎ ' : '> '
    const markW = getTextWidth(mark)
    return mark + clipByPixels(item.label, Math.max(24, GLASSES_CONTENT_WIDTH - markW))
  })
}

function formatDiagnostic(state: DisplayState): string {
  const { env, companion } = state
  const lines: string[] = [...headerLines(APP_VERSION)]
  lines.push(`mode: ${state.mode}`)
  if (state.mode === 'loading' && state.loadingStep) lines.push(`step: ${state.loadingStep}`)
  lines.push(`omoserv: ${companion.status}`)
  if (companion.detail) lines.push(clipByPixels(`omoserv-detail: ${companion.detail}`, GLASSES_CONTENT_WIDTH))
  lines.push(clipByPixels(`origin: ${env.origin}`, GLASSES_CONTENT_WIDTH))
  lines.push(clipByPixels(`ua: ${env.uaFull}`, GLASSES_CONTENT_WIDTH))
  lines.push(`backend: ${clipByPixels(state.modelLabel, Math.max(24, GLASSES_CONTENT_WIDTH - getTextWidth('backend: ')))}`)
  if (state.probeOnly) lines.push('probeOnly: yes')
  if (state.companionProbe) lines.push('companionProbe: yes')
  if (state.error) {
    lines.push('')
    lines.push(`ERR @ ${phaseLabel(state.error.phase)}`)
    lines.push(clipByPixels(state.error.message, GLASSES_CONTENT_WIDTH))
  }
  lines.push('')
  lines.push('press/double: copy diagnostics')
  const out = lines.join('\n')
  return out.length > TEXT_UPGRADE_MAX ? out.slice(0, TEXT_UPGRADE_MAX - 1) + '…' : out
}

export function formatHubText(state: DisplayState): string {
  if (state.probeOnly || state.companionProbe) {
    return formatDiagnostic(state)
  }

  const lines: string[] = [...headerLines(APP_VERSION)]

  if (state.mode === 'loading') {
    lines.push(state.loadingStep ? `loading: ${state.loadingStep}` : 'loading…')
    return finalize(lines)
  }

  if (state.mode === 'error' && state.error) {
    lines.push(`ERR @ ${phaseLabel(state.error.phase)}`)
    lines.push(clipByPixels(state.error.message, GLASSES_CONTENT_WIDTH))
    lines.push('')
    lines.push('press: retry')
    return finalize(lines)
  }

  if (!state.chatReady) {
    lines.push('setup: set URL/token in phone settings')
    return finalize(lines)
  }

  if (state.viewMode === 'history') {
    const pages = paginateHistory(state.messages)
    const pageIndex = clamp(state.historyPageIndex, 0, Math.max(0, pages.length - 1))
    const body = pages[pageIndex] ?? ''
    if (!body) {
      lines.push('(no messages yet)')
    } else {
      lines.push(...body.split('\n'))
    }
    lines.push('')
    lines.push(clipByPixels(`history ${pageIndex + 1}/${pages.length}`, GLASSES_CONTENT_WIDTH))
    lines.push(clipByPixels('swipe: page · double: menu', GLASSES_CONTENT_WIDTH))
    return finalize(lines)
  }

  // selection: last turn only, N-line budget, menu always last (idle).
  const preview = formatLastTurnPreview(state.messages, state.streamingTail, SELECTION_BODY_MAX_LINES)
  if (preview.length) {
    lines.push(...preview)
    lines.push('')
  }

  if (state.mode === 'thinking') {
    lines.push('generating…')
    lines.push('press: cancel')
  } else {
    if (state.notice) lines.push(clipByPixels(state.notice, GLASSES_CONTENT_WIDTH))
    lines.push(...formatMenu(state.menuItems, state.selectedMenuIndex))
  }

  return finalize(lines)
}

function finalize(lines: string[]): string {
  const out = lines.join('\n')
  if (out.length <= TEXT_UPGRADE_MAX) return out
  // Prefer code-point safe trim by UTF-16 length limit used by host.
  return out.slice(0, TEXT_UPGRADE_MAX - 1) + '…'
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/**
 * Scroll offset for TextContainerUpgrade.
 * Selection mode is sized to fit on-screen → always 0 (avoids host scrollbar).
 * History pages are packed to the Hub char budget; keep 0 (swipe between pages).
 */
export function contentOffsetFor(_viewMode: ViewMode, _content: string): number {
  return 0
}
