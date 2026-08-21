import { describe, expect, it } from 'vitest'
import {
  formatHubText,
  buildMenuItems,
  TEXT_UPGRADE_SAFE_UTF8,
  type DisplayState,
} from './display.ts'
import { textPayloadMetrics } from './hubPaint.ts'
import { applyHistoryPageDelta, applyViewModeToggle, fullTextUpgradePayload } from './viewMode.ts'

const base = {
  mode: 'idle' as const,
  viewMode: 'selection' as const,
  chatReady: true,
  probeOnly: false,
  companionProbe: false,
  messages: [] as { role: 'user' | 'assistant'; content: string }[],
  historyPageIndex: 0,
}

describe('applyViewModeToggle', () => {
  it('switches selection → history at the last page', () => {
    const messages = [
      { role: 'user' as const, content: 'a' },
      { role: 'assistant' as const, content: 'あ'.repeat(1500) },
      { role: 'user' as const, content: 'b' },
      { role: 'assistant' as const, content: 'い'.repeat(1500) },
    ]
    const next = applyViewModeToggle({ ...base, messages })
    expect(next).not.toBeNull()
    expect(next!.viewMode).toBe('history')
    expect(next!.historyPageIndex).toBeGreaterThan(0)
  })

  it('switches history → selection', () => {
    const next = applyViewModeToggle({ ...base, viewMode: 'history', historyPageIndex: 2 })
    expect(next).toEqual({ ...base, viewMode: 'selection', historyPageIndex: 2 })
  })

  it('ignores toggle while thinking (so cancel path owns the gesture)', () => {
    expect(applyViewModeToggle({ ...base, mode: 'thinking' })).toBeNull()
  })

  it('ignores toggle when chat is not ready', () => {
    expect(applyViewModeToggle({ ...base, chatReady: false })).toBeNull()
  })

  it('toggles to history on a long conversation and stays under Hub text limit', () => {
    const messages = []
    for (let i = 0; i < 12; i++) {
      messages.push({ role: 'user' as const, content: `q${i}` })
      messages.push({ role: 'assistant' as const, content: 'あ'.repeat(250) })
    }
    const next = applyViewModeToggle({ ...base, messages })
    expect(next).not.toBeNull()
    expect(next!.viewMode).toBe('history')

    const menuItems = buildMenuItems(['調べ物を手伝って', 'アイデアが欲しい'])
    const state: DisplayState = {
      mode: 'idle',
      viewMode: next!.viewMode,
      selectedMenuIndex: 0,
      menuItems,
      messages,
      historyPageIndex: next!.historyPageIndex,
      streamingTail: '',
      voicePhase: 'off',
      voiceTranscript: '',
      voiceRecordingElapsedSec: 0,
      voiceMarqueeShift: 0,
      env: {
        origin: '',
        protocol: '',
        secureContext: true,
        crossOriginIsolated: false,
        uaFull: '',
        uad: null,
      },
      companion: { status: 'skip', url: '', detail: '' },
      modelLabel: 'x',
      chatReady: true,
      probeOnly: false,
      companionProbe: false,
    }
    const text = formatHubText(state)
    expect(textPayloadMetrics(text).utf8Len).toBeLessThanOrEqual(TEXT_UPGRADE_SAFE_UTF8)
    expect(text).toContain('history ')
  })
})

describe('applyHistoryPageDelta', () => {
  it('pages within bounds in history mode', () => {
    const messages = [
      { role: 'user' as const, content: 'a' },
      { role: 'assistant' as const, content: 'あ'.repeat(400) },
    ]
    const started = applyViewModeToggle({ ...base, messages })!
    const older = applyHistoryPageDelta(started, -1)
    expect(older).not.toBeNull()
    expect(older!.historyPageIndex).toBeLessThanOrEqual(started.historyPageIndex)
  })

  it('ignores paging outside history idle', () => {
    expect(applyHistoryPageDelta({ ...base, viewMode: 'selection' }, 1)).toBeNull()
  })
})

describe('fullTextUpgradePayload', () => {
  it('omits contentOffset/contentLength so the host does a full replace', () => {
    const payload = fullTextUpgradePayload(1, 'chat', 'hello')
    expect(payload).toEqual({ containerID: 1, containerName: 'chat', content: 'hello' })
    expect('contentOffset' in payload).toBe(false)
    expect('contentLength' in payload).toBe(false)
  })
})
