import { describe, expect, it } from 'vitest'
import {
  APP_VERSION,
  buildMenuItems,
  formatHubText,
  formatSelectionPanes,
  GLASSES_CANVAS_HEIGHT,
  MIC_MENU_ID,
  TEXT_COLOR_ASSISTANT,
  TEXT_COLOR_USER,
  type DisplayState,
  type MenuItem,
} from './display.ts'
import {
  MIC_IDLE_LABEL,
  MIC_TRANSCRIBING_LABEL,
  VOICE_MAX_SECONDS,
  formatVoiceRecordingClock,
  micLineLabel,
} from './voiceUi.ts'

const baseEnv = {
  origin: 'http://localhost',
  protocol: 'http:',
  secureContext: true,
  crossOriginIsolated: false,
  uaFull: 'test-ua',
  uad: null,
}

const menuItems: MenuItem[] = buildMenuItems(['調べ物を手伝って', 'アイデアが欲しい'])

function state(overrides: Partial<DisplayState> = {}): DisplayState {
  return {
    mode: 'idle',
    viewMode: 'selection',
    selectedMenuIndex: 2,
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
    modelLabel: 'omoserv · gemma-4-e4b',
    chatReady: true,
    probeOnly: false,
    companionProbe: false,
    ...overrides,
  }
}

describe('micLineLabel', () => {
  it('idle / recording / transcribing / ready', () => {
    expect(micLineLabel({ voicePhase: 'off', voiceTranscript: '', voiceRecordingElapsedSec: 0 })).toBe(
      MIC_IDLE_LABEL,
    )
    expect(
      micLineLabel({ voicePhase: 'recording', voiceTranscript: '', voiceRecordingElapsedSec: 18 }),
    ).toBe('● 録音中  0:18 / 0:30')
    expect(
      micLineLabel({ voicePhase: 'transcribing', voiceTranscript: '', voiceRecordingElapsedSec: 0 }),
    ).toBe(MIC_TRANSCRIBING_LABEL)
    expect(
      micLineLabel({
        voicePhase: 'ready',
        voiceTranscript: '渋谷駅までの行き方を教えて',
        voiceRecordingElapsedSec: 0,
      }),
    ).toBe('渋谷駅までの行き方を教えて')
  })
})

describe('mic menu label', () => {
  it('uses long-press idle copy', () => {
    const mic = buildMenuItems(['a', 'b']).find((i) => i.id === MIC_MENU_ID)
    expect(mic?.label).toBe(MIC_IDLE_LABEL)
  })
})

describe('formatVoiceRecordingClock', () => {
  it('formats elapsed against the 30s cap', () => {
    expect(formatVoiceRecordingClock(0)).toBe('0:00 / 0:30')
    expect(formatVoiceRecordingClock(18)).toBe('0:18 / 0:30')
    expect(formatVoiceRecordingClock(30)).toBe('0:30 / 0:30')
    expect(formatVoiceRecordingClock(99)).toBe('0:30 / 0:30')
    expect(VOICE_MAX_SECONDS).toBe(30)
  })
})

describe('textColor roles', () => {
  it('makes assistant brighter than user so replies draw attention', () => {
    expect(TEXT_COLOR_ASSISTANT).toBeGreaterThan(TEXT_COLOR_USER)
    expect(TEXT_COLOR_ASSISTANT).toBe(4)
    expect(TEXT_COLOR_USER).toBe(2)
  })

  it('formatSelectionPanes assigns brighter color to assistant pane', () => {
    const panes = formatSelectionPanes(
      state({
        messages: [
          { role: 'user', content: 'こんにちは' },
          { role: 'assistant', content: 'はい、どうぞ' },
        ],
        selectedMenuIndex: 0,
      }),
    )
    expect(panes).not.toBeNull()
    const user = panes!.find((p) => p.containerName === 'omo-user')
    const assistant = panes!.find((p) => p.containerName === 'omo-assistant')
    expect(user?.textColor).toBe(TEXT_COLOR_USER)
    expect(assistant?.textColor).toBe(TEXT_COLOR_ASSISTANT)
    expect(assistant!.textColor).toBeGreaterThan(user!.textColor)
  })

  it('keeps the event-capture menu pane inside the canvas so double-press works', () => {
    const panes = formatSelectionPanes(
      state({
        messages: [
          { role: 'user', content: '長い質問です。'.repeat(8) },
          { role: 'assistant', content: 'あ'.repeat(400) },
        ],
        selectedMenuIndex: 0,
      }),
    )
    expect(panes).not.toBeNull()
    for (const p of panes!) {
      expect(p.yPosition).toBeGreaterThanOrEqual(0)
      expect(p.yPosition + p.height).toBeLessThanOrEqual(GLASSES_CANVAS_HEIGHT)
    }
    const menu = panes!.find((p) => p.containerName === 'omo-menu')
    expect(menu?.isEventCapture).toBe(1)
    expect(menu!.yPosition + menu!.height).toBe(GLASSES_CANVAS_HEIGHT)
  })
})

describe('formatHubText voice phases', () => {
  it('keeps the suggestion menu and shows recording on the mic row', () => {
    const text = formatHubText(
      state({ voicePhase: 'recording', voiceRecordingElapsedSec: 18, selectedMenuIndex: 2 }),
    )
    expect(text).toContain('調べ物を手伝って')
    expect(text).toContain('アイデアが欲しい')
    expect(text).toContain('● 録音中  0:18 / 0:30')
    expect(text).not.toContain('話してください')
    expect(text).not.toContain('■ tap: 録音停止')
    expect(text).not.toContain(MIC_IDLE_LABEL)
  })

  it('shows transcribing on the mic row', () => {
    const text = formatHubText(state({ voicePhase: 'transcribing', selectedMenuIndex: 2 }))
    expect(text).toContain(MIC_TRANSCRIBING_LABEL)
    expect(text).toContain('調べ物を手伝って')
  })

  it('shows transcript on the mic row without confirm chrome', () => {
    const text = formatHubText(
      state({
        voicePhase: 'ready',
        voiceTranscript: '渋谷駅までの行き方を教えて',
        selectedMenuIndex: 2,
      }),
    )
    expect(text).toContain(`omochat v${APP_VERSION}`)
    expect(text).toContain('▶︎ 渋谷駅までの行き方を教えて')
    expect(text).not.toContain('認識結果')
    expect(text).not.toContain('このまま送る')
    expect(text).not.toContain('録り直す')
  })
})
