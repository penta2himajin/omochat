import { getTextWidth } from '@evenrealities/pretext'
import { phaseLabel, type AppError } from './errors.ts'
import type { EnvProbeResult } from './env/probe.ts'
import type { CompanionProbeResult } from './companion/probe.ts'
import {
  buildTitleSeparator,
  clipByPixels,
  GLASSES_CANVAS_HEIGHT,
  GLASSES_CANVAS_WIDTH,
  GLASSES_CONTENT_WIDTH,
  GLASSES_LINE_HEIGHT_PX,
  GLASSES_PADDING_LENGTH,
  GLASSES_VIEWPORT_LINES,
  wrapByPixels,
} from './glassesLayout.ts'
import { takeUtf8Prefix, utf8ByteLength } from './hubPaint.ts'
import { markdownToPlainGlasses } from './markdownPlain.ts'
import { marqueeNeeded, marqueeSliceByPixels } from './marquee.ts'
import {
  MIC_IDLE_LABEL,
  resolveMenuItemLabel,
  type VoicePhase,
} from './voiceUi.ts'

export type { VoicePhase } from './voiceUi.ts'
export {
  MIC_IDLE_LABEL,
  MIC_TRANSCRIBING_LABEL,
  VOICE_MAX_SECONDS,
  VOICE_PCM_MAX_BYTES,
  formatVoiceRecordingClock,
  mergePcmChunks,
  micLineLabel,
  resolveMenuItemLabel,
} from './voiceUi.ts'

/** Even Hub textColor 0–4. Brighter = more attention on mono green. */
export const TEXT_COLOR_ASSISTANT = 4
export const TEXT_COLOR_USER = 2
export const TEXT_COLOR_CHROME = 4

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

export const APP_VERSION = '0.1.4'
/**
 * Even Hub textContainerUpgrade limit.
 * Device probe (v0.0.24): rejection tracks UTF-8 bytes; utf8=2000 also failed,
 * so we stay under TEXT_UPGRADE_SAFE_UTF8.
 */
export const TEXT_UPGRADE_MAX = 2000
/** Safe UTF-8 byte ceiling for a full formatted TextContainer payload. */
export const TEXT_UPGRADE_SAFE_UTF8 = 1900
/** Full-width rule under the title; sized to the firmware content box. */
export const TITLE_SEPARATOR = buildTitleSeparator()
/**
 * header(2) + blank(1) + footer(2) reserved in history chrome layout comments.
 * History pages use a UTF-8 byte budget (see historyBodyMaxUtf8).
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

/** UTF-8 bytes reserved for header + footer on a history page. */
export function historyChromeReserveUtf8(): number {
  const header = `omochat v${APP_VERSION}\n${TITLE_SEPARATOR}`
  const footer = `\n\nhistory 999/999\nswipe: page · double: menu`
  return utf8ByteLength(header) + utf8ByteLength(footer)
}

/** @deprecated Prefer historyChromeReserveUtf8. */
export function historyChromeReserve(): number {
  return historyChromeReserveUtf8()
}

/** Default body UTF-8 budget for one history page. */
export function historyBodyMaxUtf8(): number {
  return Math.max(32, TEXT_UPGRADE_SAFE_UTF8 - historyChromeReserveUtf8())
}

/** @deprecated Prefer historyBodyMaxUtf8. */
export function historyBodyMaxChars(): number {
  return historyBodyMaxUtf8()
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
  /** Glasses mic flow on the mic menu row (no full-screen confirm). */
  voicePhase: VoicePhase
  /** Transcript on the mic row when `voicePhase === 'ready'` (tap to send). */
  voiceTranscript: string
  /** Elapsed seconds while `voicePhase === 'recording'`. */
  voiceRecordingElapsedSec: number
  /** Grapheme shift for mic-row marquee while `ready` (0 = dwell / ellipsis). */
  voiceMarqueeShift: number
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
      label: MIC_IDLE_LABEL,
      kind: 'mic',
    },
  ]
}

export function formatMessageLine(msg: ChatMessage, maxPx = GLASSES_CONTENT_WIDTH): string {
  const prefix = msg.role === 'user' ? 'You: ' : 'AI: '
  const prefixW = getTextWidth(prefix)
  const body = markdownToPlainGlasses(msg.content).replace(/\s+/g, ' ').trim()
  return prefix + clipByPixels(body, Math.max(24, maxPx - prefixW))
}

/** Wrap a message across multiple lines (prefix on the first line only). */
export function wrapMessageLines(msg: ChatMessage, maxPx = GLASSES_CONTENT_WIDTH): string[] {
  const prefix = msg.role === 'user' ? 'You: ' : 'AI: '
  const plain = markdownToPlainGlasses(msg.content)
  const paragraphs = plain
    .split(/\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  if (paragraphs.length === 0) return wrapByPixels(prefix.trimEnd(), maxPx)

  const out: string[] = []
  paragraphs.forEach((para, i) => {
    const chunk = i === 0 ? prefix + para : para
    out.push(...wrapByPixels(chunk, maxPx))
  })
  return out
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
 * Pack history into page bodies by Hub UTF-8 byte budget (safe ceiling minus chrome).
 * Multiple turns share a page until the budget is full; overflow continues on the
 * next page. Continuation markers (trailing/leading …) are used only when a break
 * cuts mid-message; clean breaks between You:/AI: turns have no markers.
 * Returns oldest→newest page body strings; empty history → one empty page.
 */
export function paginateHistory(
  messages: ChatMessage[],
  maxBodyUtf8: number = historyBodyMaxUtf8(),
): string[] {
  if (messages.length === 0) return ['']

  const stream = messages.flatMap((m) => wrapMessageLines(m)).join('\n')
  if (!stream) return ['']

  const ensureLineWidths = (page: string): string =>
    page
      .split('\n')
      .flatMap((line) =>
        getTextWidth(line) <= GLASSES_CONTENT_WIDTH ? [line] : wrapByPixels(line),
      )
      .join('\n')

  const ellipsis = '…'
  const ellipsisUtf8 = utf8ByteLength(ellipsis)
  const isMessageStartLine = (line: string) => line.startsWith('You: ') || line.startsWith('AI: ')

  const fitBody = (page: string): string => {
    const widened = ensureLineWidths(page)
    if (utf8ByteLength(widened) <= maxBodyUtf8) return widened
    return takeUtf8Prefix(widened, maxBodyUtf8)
  }

  /** Prefer breaking before a You:/AI: line; else at any newline. */
  const preferredChunk = (rest: string, budget: number): { chunk: string; atNewline: boolean } => {
    const hard = takeUtf8Prefix(rest, budget)
    if (!hard) return { chunk: '', atNewline: false }

    const msgBreak = /\n(?=You: |AI: )/g
    let lastMsgBreak = -1
    let m: RegExpExecArray | null
    while ((m = msgBreak.exec(hard)) !== null) {
      lastMsgBreak = m.index
    }
    // Skip early message breaks (e.g. after a short "You: q") so we do not
    // leave a near-empty first page and suppress mid-body … markers.
    if (lastMsgBreak > 0 && lastMsgBreak >= Math.floor(hard.length * 0.4)) {
      return { chunk: hard.slice(0, lastMsgBreak), atNewline: true }
    }

    const nl = hard.lastIndexOf('\n')
    if (nl > 0 && nl >= Math.floor(hard.length * 0.4)) {
      return { chunk: hard.slice(0, nl), atNewline: true }
    }
    return { chunk: hard, atNewline: false }
  }

  const pages: string[] = []
  let offset = 0
  let continuation = false

  while (offset < stream.length) {
    const prefix = continuation ? HISTORY_CONTINUATION_PREFIX : ''
    const rest = stream.slice(offset)
    const widenedWhole = ensureLineWidths(prefix + rest)
    if (utf8ByteLength(widenedWhole) <= maxBodyUtf8) {
      pages.push(widenedWhole)
      break
    }

    const prefixUtf8 = utf8ByteLength(prefix)
    const budget = maxBodyUtf8 - prefixUtf8 - ellipsisUtf8
    if (budget <= 0) {
      pages.push(fitBody(prefix + ellipsis))
      break
    }

    let { chunk, atNewline } = preferredChunk(rest, budget)
    if (!chunk) {
      chunk = takeUtf8Prefix(rest, Math.max(budget, 1))
      atNewline = false
    }

    let nextOffset = offset + chunk.length
    if (stream[nextOffset] === '\n') nextOffset += 1
    const hasMore = nextOffset < stream.length
    const nextLine = hasMore ? (stream.slice(nextOffset).split('\n')[0] ?? '') : ''
    const cleanTurnBreak = hasMore && atNewline && isMessageStartLine(nextLine)
    const needsMarker = hasMore && !cleanTurnBreak

    pages.push(
      needsMarker
        ? (() => {
            const marked = prefix + chunk + ellipsis
            const fitted = fitBody(marked)
            return fitted.endsWith(ellipsis)
              ? fitted
              : takeUtf8Prefix(fitted, maxBodyUtf8 - ellipsisUtf8) + ellipsis
          })()
        : fitBody(prefix + chunk),
    )
    offset = nextOffset
    continuation = needsMarker
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

/** Last turn split by role for multi-color TextContainers. */
export function formatLastTurnRoleLines(
  messages: ChatMessage[],
  streamingTail: string,
  maxLines: number = SELECTION_BODY_MAX_LINES,
): { user: string[]; assistant: string[] } {
  const list =
    streamingTail.length > 0
      ? [...messages, { role: 'assistant' as const, content: streamingTail }]
      : messages
  const turns = messagesToTurns(list)
  const last = turns[turns.length - 1]
  if (!last || last.length === 0) return { user: [], assistant: [] }

  const userMsgs = last.filter((m) => m.role === 'user')
  const assistantMsgs = last.filter((m) => m.role === 'assistant')
  const userWrapped = userMsgs.flatMap((m) => wrapMessageLines(m))
  const assistantWrapped = assistantMsgs.flatMap((m) => wrapMessageLines(m))

  if (userWrapped.length + assistantWrapped.length <= maxLines) {
    return { user: userWrapped, assistant: assistantWrapped }
  }
  // Prefer keeping some assistant lines when the budget is tight.
  const assistantBudget = Math.min(assistantWrapped.length, Math.max(1, Math.floor(maxLines / 2)))
  const userBudget = Math.max(0, maxLines - assistantBudget)
  return {
    user: fitLinesWithEllipsis(userWrapped, userBudget),
    assistant: fitLinesWithEllipsis(assistantWrapped, assistantBudget),
  }
}

function formatMenu(
  items: MenuItem[],
  selectedIndex: number,
  voice: {
    voicePhase: VoicePhase
    voiceTranscript: string
    voiceRecordingElapsedSec: number
    voiceMarqueeShift: number
  },
): string[] {
  return items.map((item, i) => {
    const mark = i === selectedIndex ? '▶︎ ' : '> '
    const markW = getTextWidth(mark)
    const maxPx = Math.max(24, GLASSES_CONTENT_WIDTH - markW)
    const label = resolveMenuItemLabel(item, voice)
    if (
      item.kind === 'mic' &&
      voice.voicePhase === 'ready' &&
      voice.voiceMarqueeShift > 0 &&
      marqueeNeeded(label, maxPx)
    ) {
      return mark + marqueeSliceByPixels(label, voice.voiceMarqueeShift, maxPx)
    }
    return mark + clipByPixels(label, maxPx)
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
  return finalize(lines)
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

  // selection: last turn + pinned menu (mic row carries voice state).
  const voice = {
    voicePhase: state.voicePhase,
    voiceTranscript: state.voiceTranscript,
    voiceRecordingElapsedSec: state.voiceRecordingElapsedSec,
    voiceMarqueeShift: state.voiceMarqueeShift,
  }

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
    lines.push(...formatMenu(state.menuItems, state.selectedMenuIndex, voice))
  }

  return finalize(lines)
}

function finalize(lines: string[]): string {
  const out = lines.join('\n')
  if (utf8ByteLength(out) <= TEXT_UPGRADE_SAFE_UTF8) return out
  const ellipsis = '…'
  return takeUtf8Prefix(out, TEXT_UPGRADE_SAFE_UTF8 - utf8ByteLength(ellipsis)) + ellipsis
}

export type HubTextPane = {
  containerID: number
  containerName: string
  xPosition: number
  yPosition: number
  width: number
  height: number
  content: string
  textColor: number
  isEventCapture: number
  zOrderIndex: number
}

export const HUB_PANE_HEADER_ID = 1
export const HUB_PANE_USER_ID = 2
export const HUB_PANE_ASSISTANT_ID = 3
export const HUB_PANE_MENU_ID = 4

function paneHeightForLines(lineCount: number): number {
  return Math.max(GLASSES_LINE_HEIGHT_PX, lineCount * GLASSES_LINE_HEIGHT_PX)
}

/**
 * Selection-mode Hub layout: user dimmer, assistant brighter (attention on replies).
 * History / probe / error keep a single full-canvas pane via {@link formatHubText}.
 *
 * The menu pane is always pinned to the bottom of the canvas with isEventCapture=1.
 * Body panes are line-budgeted to fit above it — otherwise Hub loses double-press /
 * swipe when the capture container is laid out past y=288.
 */
export function formatSelectionPanes(state: DisplayState): HubTextPane[] | null {
  if (state.probeOnly || state.companionProbe) return null
  if (state.mode === 'loading' || state.mode === 'error') return null
  if (!state.chatReady) return null
  if (state.viewMode === 'history') return null

  const voice = {
    voicePhase: state.voicePhase,
    voiceTranscript: state.voiceTranscript,
    voiceRecordingElapsedSec: state.voiceRecordingElapsedSec,
    voiceMarqueeShift: state.voiceMarqueeShift,
  }

  const header = headerLines(APP_VERSION)
  const menuBlock: string[] = []
  if (state.mode === 'thinking') {
    menuBlock.push('generating…', 'press: cancel')
  } else {
    if (state.notice) menuBlock.push(clipByPixels(state.notice, GLASSES_CONTENT_WIDTH))
    menuBlock.push(...formatMenu(state.menuItems, state.selectedMenuIndex, voice))
  }

  const menuH = paneHeightForLines(Math.max(1, menuBlock.length))
  const menuY = Math.max(0, GLASSES_CANVAS_HEIGHT - menuH)
  const headerH = paneHeightForLines(header.length)
  const bodyBudgetPx = Math.max(0, menuY - headerH)
  const bodyMaxLines = Math.max(
    0,
    Math.min(SELECTION_BODY_MAX_LINES, Math.floor(bodyBudgetPx / GLASSES_LINE_HEIGHT_PX)),
  )
  const roles = formatLastTurnRoleLines(state.messages, state.streamingTail, bodyMaxLines)

  const panes: HubTextPane[] = []
  let y = 0
  let z = 1

  const push = (
    id: number,
    name: string,
    lines: string[],
    textColor: number,
    capture: number,
    maxBottom: number,
  ) => {
    if (lines.length === 0) return
    let height = paneHeightForLines(lines.length)
    if (y >= maxBottom) return
    if (y + height > maxBottom) {
      const fitLines = Math.floor((maxBottom - y) / GLASSES_LINE_HEIGHT_PX)
      if (fitLines <= 0) return
      height = paneHeightForLines(fitLines)
      const clipped = fitLinesWithEllipsis(lines, fitLines)
      panes.push({
        containerID: id,
        containerName: name,
        xPosition: 0,
        yPosition: y,
        width: GLASSES_CANVAS_WIDTH,
        height,
        content: finalize(clipped),
        textColor,
        isEventCapture: capture,
        zOrderIndex: z++,
      })
      y += height
      return
    }
    panes.push({
      containerID: id,
      containerName: name,
      xPosition: 0,
      yPosition: y,
      width: GLASSES_CANVAS_WIDTH,
      height,
      content: finalize(lines),
      textColor,
      isEventCapture: capture,
      zOrderIndex: z++,
    })
    y += height
  }

  push(HUB_PANE_HEADER_ID, 'omo-header', header, TEXT_COLOR_CHROME, 0, menuY)
  push(HUB_PANE_USER_ID, 'omo-user', roles.user, TEXT_COLOR_USER, 0, menuY)
  push(HUB_PANE_ASSISTANT_ID, 'omo-assistant', roles.assistant, TEXT_COLOR_ASSISTANT, 0, menuY)

  panes.push({
    containerID: HUB_PANE_MENU_ID,
    containerName: 'omo-menu',
    xPosition: 0,
    yPosition: menuY,
    width: GLASSES_CANVAS_WIDTH,
    height: menuH,
    content: finalize(menuBlock),
    textColor: TEXT_COLOR_CHROME,
    isEventCapture: 1,
    zOrderIndex: z,
  })

  return panes
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/**
 * Scroll offset helper (unused for upgrades — full replace omits contentOffset).
 * Kept at 0; history pages may exceed the viewport and scroll in firmware.
 */
export function contentOffsetFor(_viewMode: ViewMode, _content: string): number {
  return 0
}
