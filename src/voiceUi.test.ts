import { describe, expect, it } from 'vitest'
import {
  APP_VERSION,
  buildMenuItems,
  formatHubText,
  MIC_MENU_ID,
  type DisplayState,
  type MenuItem,
} from './display.ts'
import {
  VOICE_CONFIRM_RERECORD_ID,
  VOICE_CONFIRM_SEND_ID,
  VOICE_MAX_SECONDS,
  formatVoiceRecordingClock,
  voiceConfirmMenuItems,
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
    selectedMenuIndex: 0,
    menuItems,
    messages: [],
    historyPageIndex: 0,
    streamingTail: '',
    voicePhase: 'off',
    voiceTranscript: '',
    voiceRecordingElapsedSec: 0,
    env: baseEnv,
    companion: { status: 'skip', url: '', detail: 'disabled' },
    modelLabel: 'omoserv · gemma-4-e2b',
    chatReady: true,
    probeOnly: false,
    companionProbe: false,
    ...overrides,
  }
}

describe('voiceConfirmMenuItems', () => {
  it('offers send and re-record only', () => {
    const items = voiceConfirmMenuItems()
    expect(items.map((i) => i.id)).toEqual([VOICE_CONFIRM_SEND_ID, VOICE_CONFIRM_RERECORD_ID])
    expect(items.every((i) => i.kind === 'prompt')).toBe(true)
  })
})

describe('mic menu label', () => {
  it('uses glassearch-style start copy', () => {
    const mic = buildMenuItems(['a', 'b']).find((i) => i.id === MIC_MENU_ID)
    expect(mic?.label).toBe('▷ tap: 録音開始')
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

describe('formatHubText voice phases', () => {
  it('shows recording chrome instead of the idle menu', () => {
    const text = formatHubText(state({ voicePhase: 'recording', voiceRecordingElapsedSec: 18 }))
    expect(text).toContain('● 録音中  0:18 / 0:30')
    expect(text).toContain('話してください')
    expect(text).toContain('■ tap: 録音停止')
    expect(text).not.toContain('▷ tap: 録音開始')
  })

  it('shows transcribing chrome', () => {
    const text = formatHubText(state({ voicePhase: 'transcribing' }))
    expect(text).toContain('認識中...')
    expect(text).not.toContain('▷ tap: 録音開始')
  })

  it('shows transcript confirm with send / re-record menu', () => {
    const text = formatHubText(
      state({
        voicePhase: 'confirm',
        voiceTranscript: '渋谷駅までの行き方を教えて',
        selectedMenuIndex: 0,
      }),
    )
    expect(text).toContain(`omochat v${APP_VERSION}`)
    expect(text).toContain('認識結果')
    expect(text).toContain('渋谷駅までの行き方を教えて')
    expect(text).toContain('▶︎ このまま送る')
    expect(text).toContain('> 録り直す')
    expect(text).not.toContain('▷ tap: 録音開始')
  })
})
