import type { MenuItem } from './display.ts'

export type VoicePhase = 'off' | 'recording' | 'transcribing' | 'confirm'

export const VOICE_CONFIRM_SEND_ID = 'voice-send'
export const VOICE_CONFIRM_RERECORD_ID = 'voice-rerecord'

/** Max recording length (wall clock + PCM budget). */
export const VOICE_MAX_SECONDS = 30
export const VOICE_SAMPLE_RATE = 16_000
/** Raw PCM bytes for VOICE_MAX_SECONDS at 16 kHz s16le mono. */
export const VOICE_PCM_MAX_BYTES = VOICE_SAMPLE_RATE * 2 * VOICE_MAX_SECONDS

export function voiceConfirmMenuItems(): MenuItem[] {
  return [
    { id: VOICE_CONFIRM_SEND_ID, label: 'このまま送る', kind: 'prompt' },
    { id: VOICE_CONFIRM_RERECORD_ID, label: '録り直す', kind: 'prompt' },
  ]
}

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
