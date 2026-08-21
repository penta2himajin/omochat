import type { MenuItem } from './display.ts'

export type VoicePhase = 'off' | 'recording' | 'transcribing' | 'ready'

export const VOICE_MAX_SECONDS = 30
export const VOICE_SAMPLE_RATE = 16_000
/** Raw PCM bytes for VOICE_MAX_SECONDS at 16 kHz s16le mono. */
export const VOICE_PCM_MAX_BYTES = VOICE_SAMPLE_RATE * 2 * VOICE_MAX_SECONDS

export const MIC_IDLE_LABEL = 'long-press: 音声入力'
export const MIC_TRANSCRIBING_LABEL = '(認識中...)'

export function formatVoiceRecordingClock(
  elapsedSec: number,
  maxSec: number = VOICE_MAX_SECONDS,
): string {
  const clamped = Math.max(0, Math.min(maxSec, Math.floor(elapsedSec)))
  return `${formatMmSs(clamped)} / ${formatMmSs(maxSec)}`
}

function formatMmSs(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function micLineLabel(args: {
  voicePhase: VoicePhase
  voiceTranscript: string
  voiceRecordingElapsedSec: number
}): string {
  switch (args.voicePhase) {
    case 'recording':
      return `● 録音中  ${formatVoiceRecordingClock(args.voiceRecordingElapsedSec)}`
    case 'transcribing':
      return MIC_TRANSCRIBING_LABEL
    case 'ready':
      return args.voiceTranscript.trim() || MIC_IDLE_LABEL
    default:
      return MIC_IDLE_LABEL
  }
}

/** Resolve the label shown for the mic menu row (before selection mark / marquee). */
export function resolveMenuItemLabel(
  item: MenuItem,
  voice: {
    voicePhase: VoicePhase
    voiceTranscript: string
    voiceRecordingElapsedSec: number
  },
): string {
  if (item.kind === 'mic') return micLineLabel(voice)
  return item.label
}

export function mergePcmChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const merged = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    merged.set(c, offset)
    offset += c.length
  }
  return merged
}
