import { describe, expect, it } from 'vitest'
import { getTextWidth, measureTextWrap } from '@evenrealities/pretext'
import {
  buildMenuItems,
  clipByPixels,
  clipDisplay,
  contentOffsetFor,
  displayWidth,
  fitLinesWithEllipsis,
  formatHubText,
  formatLastTurnPreview,
  GLASSES_CONTENT_HEIGHT,
  GLASSES_CONTENT_WIDTH,
  GLASSES_VIEWPORT_LINES,
  HISTORY_CONTINUATION_PREFIX,
  MIC_MENU_ID,
  paginateHistory,
  SELECTION_BODY_MAX_LINES,
  TEXT_UPGRADE_MAX,
  TEXT_UPGRADE_SAFE_UTF8,
  TITLE_SEPARATOR,
  wrapByPixels,
  type DisplayState,
  type MenuItem,
} from './display.ts'
import { textPayloadMetrics, utf8ByteLength } from './hubPaint.ts'

const baseEnv = {
  origin: 'http://127.0.0.1:41791',
  protocol: 'http:',
  secureContext: true,
  crossOriginIsolated: false,
  uaFull: 'test-ua',
  uad: null,
}

const menuItems: MenuItem[] = buildMenuItems(['調べ物を手伝って', 'アイデアが欲しい'])

function minimalState(overrides: Partial<DisplayState>): DisplayState {
  return {
    mode: 'idle',
    viewMode: 'selection',
    selectedMenuIndex: 0,
    menuItems,
    messages: [],
    historyPageIndex: 0,
    streamingTail: '',
    voicePhase: 'off',
    voiceTranscript: '',
    voiceRecordingElapsedSec: 0,
    voiceMarqueeShift: 0,
    env: baseEnv,
    companion: { status: 'skip', url: '', detail: 'disabled' },
    modelLabel: 'omoserv · gemma-4-e2b',
    chatReady: true,
    probeOnly: false,
    companionProbe: false,
    ...overrides,
  }
}

describe('glasses viewport constants', () => {
  it('fits 10 lines in the padded 288px content box at 27px/line', () => {
    expect(GLASSES_VIEWPORT_LINES).toBe(10)
    expect(GLASSES_CONTENT_HEIGHT).toBe(280)
    expect(SELECTION_BODY_MAX_LINES).toBe(4)
  })
})

describe('displayWidth / clipDisplay (legacy columns)', () => {
  it('counts Hangul and Kana as wide', () => {
    expect(displayWidth('あ')).toBe(2)
    expect(displayWidth('한')).toBe(2)
    expect(displayWidth('a')).toBe(1)
    expect(displayWidth('あa')).toBe(3)
  })

  it('does not split a wide character when clipping', () => {
    const clipped = clipDisplay('あいう', 3)
    expect(clipped).toBe('あ…')
  })
})

describe('wrapByPixels / clipByPixels (firmware metrics)', () => {
  it('wraps CJK to fill nearly the full content width', () => {
    const lines = wrapByPixels('あ'.repeat(40))
    expect(lines.length).toBeGreaterThan(1)
    expect(getTextWidth(lines[0]!)).toBeGreaterThan(500)
    for (const line of lines) {
      expect(getTextWidth(line)).toBeLessThanOrEqual(GLASSES_CONTENT_WIDTH)
    }
    expect(lines.length).toBe(measureTextWrap('あ'.repeat(40), GLASSES_CONTENT_WIDTH).lineCount)
  })

  it('title separator is one line spanning the content width', () => {
    expect(measureTextWrap(TITLE_SEPARATOR, GLASSES_CONTENT_WIDTH).lineCount).toBe(1)
    expect(getTextWidth(TITLE_SEPARATOR)).toBeGreaterThan(500)
    expect(getTextWidth(TITLE_SEPARATOR)).toBeLessThanOrEqual(GLASSES_CONTENT_WIDTH)
  })

  it('adds trailing ellipsis when over line budget', () => {
    const fitted = fitLinesWithEllipsis(['one', 'two', 'three', 'four'], 2)
    expect(fitted).toHaveLength(2)
    expect(fitted[1]!.endsWith('…')).toBe(true)
  })

  it('clips by pixels without exceeding budget', () => {
    const clipped = clipByPixels('あ'.repeat(40), 100)
    expect(clipped.endsWith('…')).toBe(true)
    expect(getTextWidth(clipped)).toBeLessThanOrEqual(100)
  })
})

describe('paginateHistory (UTF-8 budget)', () => {
  it('packs multiple short turns into one page under the byte budget', () => {
    const messages = [
      { role: 'user' as const, content: 'hi' },
      { role: 'assistant' as const, content: 'yo' },
      { role: 'user' as const, content: 'hi2' },
      { role: 'assistant' as const, content: 'yo2' },
    ]
    const pages = paginateHistory(messages, 500)
    expect(pages).toHaveLength(1)
    expect(pages[0]).toContain('You: hi')
    expect(pages[0]).toContain('AI: yo2')
  })

  it('splits a long reply mid-body with … continuation markers', () => {
    const long = 'あ'.repeat(120)
    const pages = paginateHistory(
      [
        { role: 'user', content: 'q' },
        { role: 'assistant', content: long },
      ],
      80,
    )
    expect(pages.length).toBeGreaterThan(1)
    expect(pages[0]!.endsWith('…')).toBe(true)
    expect(pages[1]!.startsWith(HISTORY_CONTINUATION_PREFIX)).toBe(true)
    for (const page of pages) {
      expect(utf8ByteLength(page)).toBeLessThanOrEqual(80)
    }
  })

  it('does not mark … when the page break falls between complete turns', () => {
    const messages = [
      { role: 'user' as const, content: 'first' },
      { role: 'assistant' as const, content: 'あ'.repeat(40) },
      { role: 'user' as const, content: 'second' },
      { role: 'assistant' as const, content: 'い'.repeat(40) },
    ]
    // Enough for the first full turn (~136 UTF-8), not both (~274).
    const pages = paginateHistory(messages, 150)
    expect(pages.length).toBeGreaterThan(1)
    expect(pages[0]!.endsWith('…')).toBe(false)
    expect(pages[1]!.startsWith(HISTORY_CONTINUATION_PREFIX)).toBe(false)
    expect(pages[1]).toMatch(/^You: second/)
  })

  it('empty history yields one empty page', () => {
    expect(paginateHistory([])).toEqual([''])
  })

  it('keeps each formatted history page under the safe UTF-8 Hub limit', () => {
    const messages = [
      { role: 'user' as const, content: 'long please' },
      { role: 'assistant' as const, content: 'あ'.repeat(2000) },
      { role: 'user' as const, content: 'again' },
      { role: 'assistant' as const, content: 'い'.repeat(2000) },
    ]
    const pages = paginateHistory(messages)
    expect(pages.length).toBeGreaterThan(1)
    for (let i = 0; i < pages.length; i++) {
      const text = formatHubText(
        minimalState({ viewMode: 'history', messages, historyPageIndex: i }),
      )
      const m = textPayloadMetrics(text)
      expect(m.utf8Len).toBeLessThanOrEqual(TEXT_UPGRADE_SAFE_UTF8)
      expect(m.utf8Len).toBeLessThan(TEXT_UPGRADE_MAX)
      for (const line of text.split('\n')) {
        expect(getTextWidth(line)).toBeLessThanOrEqual(GLASSES_CONTENT_WIDTH)
      }
    }
  })
})

describe('formatHubText selection / history', () => {
  it('renders selection menu with mic stub and full-width rule', () => {
    const text = formatHubText(minimalState({}))
    expect(text).toContain('omochat v0.1.4')
    expect(text).toContain(TITLE_SEPARATOR)
    expect(text).toContain('▶︎ 調べ物を手伝って')
    expect(text).toContain('> アイデアが欲しい')
    expect(text).toContain('long-press: 音声入力')
  })

  it('selection mode stays within viewport (no firmware scrollbar)', () => {
    const text = formatHubText(
      minimalState({
        messages: [
          { role: 'user', content: 'ask' },
          { role: 'assistant', content: 'あ'.repeat(400) },
        ],
      }),
    )
    const measured = measureTextWrap(text, GLASSES_CONTENT_WIDTH)
    expect(measured.lineCount).toBeLessThanOrEqual(GLASSES_VIEWPORT_LINES)
    expect(measured.height).toBeLessThanOrEqual(GLASSES_CONTENT_HEIGHT)
    for (const line of text.split('\n')) {
      expect(getTextWidth(line)).toBeLessThanOrEqual(GLASSES_CONTENT_WIDTH)
    }
  })

  it('history mode hides menu; body lines stay within content width', () => {
    const text = formatHubText(
      minimalState({
        viewMode: 'history',
        messages: [
          { role: 'user', content: 'Tell me about you.' },
          { role: 'assistant', content: 'あ'.repeat(80) },
        ],
        historyPageIndex: 0,
      }),
    )
    expect(text).toContain('You: Tell me about you.')
    expect(text).toContain('history 1/')
    expect(text).not.toContain('▶︎')
    expect(text).not.toContain(MIC_MENU_ID)
    for (const line of text.split('\n')) {
      expect(getTextWidth(line)).toBeLessThanOrEqual(GLASSES_CONTENT_WIDTH)
    }
  })

  it('history mode shows continuation ellipsis on later pages of a long reply', () => {
    const long = 'x'.repeat(3500)
    const messages = [
      { role: 'user' as const, content: 'long please' },
      { role: 'assistant' as const, content: long },
    ]
    const pages = paginateHistory(messages)
    expect(pages.length).toBeGreaterThan(1)
    expect(pages[0]!.endsWith('…')).toBe(true)
    expect(pages[1]!.startsWith(HISTORY_CONTINUATION_PREFIX)).toBe(true)

    const page0 = formatHubText(
      minimalState({ viewMode: 'history', messages, historyPageIndex: 0 }),
    )
    const page1 = formatHubText(
      minimalState({ viewMode: 'history', messages, historyPageIndex: 1 }),
    )
    expect(page0).toContain('You: long please')
    expect(page0.trimEnd().split('\n').some((l) => l.endsWith('…'))).toBe(true)
    expect(page1).toContain(HISTORY_CONTINUATION_PREFIX)
    expect(page1).toContain(`history 2/${pages.length}`)
    expect(textPayloadMetrics(page0).utf8Len).toBeLessThanOrEqual(TEXT_UPGRADE_SAFE_UTF8)
    expect(textPayloadMetrics(page1).utf8Len).toBeLessThanOrEqual(TEXT_UPGRADE_SAFE_UTF8)
  })

  it('thinking shows cancel, not menu, and stays in viewport', () => {
    const text = formatHubText(
      minimalState({
        mode: 'thinking',
        streamingTail: 'あ'.repeat(400),
        messages: [{ role: 'user', content: 'hi' }],
      }),
    )
    expect(text).toContain('generating…')
    expect(text).toContain('press: cancel')
    expect(text).not.toContain('▶︎')
    const measured = measureTextWrap(text, GLASSES_CONTENT_WIDTH)
    expect(measured.lineCount).toBeLessThanOrEqual(GLASSES_VIEWPORT_LINES)
  })

  it('diagnostic probe mode keeps omoserv lines', () => {
    const text = formatHubText(
      minimalState({
        probeOnly: true,
        companion: {
          status: 'fail',
          url: 'http://127.0.0.1:8765/hello',
          detail: 'network error',
        },
      }),
    )
    expect(text).toContain('omoserv: fail')
    expect(text).toContain('omoserv-detail: network error')
  })
})

describe('contentOffsetFor', () => {
  it('stays at 0 (upgrades use full replace without contentOffset)', () => {
    expect(contentOffsetFor('history', 'abcdef')).toBe(0)
    expect(contentOffsetFor('selection', 'abcdef')).toBe(0)
  })
})

describe('selection fit', () => {
  it('menu is exactly 2 prompts + mic', () => {
    const items = buildMenuItems(['a', 'b'])
    expect(items).toHaveLength(3)
    expect(items[2]?.kind).toBe('mic')
  })

  it('selection preview fills the body line budget then ellipsizes', () => {
    const preview = formatLastTurnPreview(
      [
        { role: 'user', content: 'second' },
        { role: 'assistant', content: 'あ'.repeat(400) },
      ],
      '',
      SELECTION_BODY_MAX_LINES,
    )
    expect(preview).toHaveLength(SELECTION_BODY_MAX_LINES)
    expect(preview[0]!.startsWith('You: second') || preview.some((l) => l.startsWith('AI:'))).toBe(true)
    expect(preview[SELECTION_BODY_MAX_LINES - 1]!.endsWith('…')).toBe(true)
  })

  it('selection shows only the last turn and pins the menu at the end', () => {
    const text = formatHubText(
      minimalState({
        messages: [
          { role: 'user', content: 'first' },
          { role: 'assistant', content: 'res1' },
          { role: 'user', content: 'second' },
          { role: 'assistant', content: 'res2' },
        ],
      }),
    )
    expect(text).toContain('You: second')
    expect(text).toContain('AI: res2')
    expect(text).not.toContain('You: first')
    const lines = text.split('\n')
    expect(lines[lines.length - 3]).toMatch(/^▶︎ /)
    expect(lines[lines.length - 1]).toContain('long-press: 音声入力')
  })

  it('selection ellipsizes long replies without history continuation pages', () => {
    const text = formatHubText(
      minimalState({
        messages: [
          { role: 'user', content: 'ask' },
          { role: 'assistant', content: 'あ'.repeat(400) },
        ],
      }),
    )
    expect(text).not.toContain('history ')
    expect(text).toContain('▶︎')
    const preview = formatLastTurnPreview(
      [
        { role: 'user', content: 'ask' },
        { role: 'assistant', content: 'あ'.repeat(400) },
      ],
      '',
      SELECTION_BODY_MAX_LINES,
    )
    expect(preview).toHaveLength(SELECTION_BODY_MAX_LINES)
    expect(preview[preview.length - 1]!.endsWith('…')).toBe(true)
  })
})
