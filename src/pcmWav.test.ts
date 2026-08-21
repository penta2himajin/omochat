import { describe, expect, it } from 'vitest'
import { pcmToWav } from './pcmWav.ts'

describe('pcmToWav', () => {
  it('wraps 16 kHz s16le mono PCM in a 44-byte WAV header', () => {
    const pcm = new Uint8Array([1, 0, 2, 0])
    const wav = pcmToWav(pcm)
    expect(wav.byteLength).toBe(48)
    expect(String.fromCharCode(wav[0]!, wav[1]!, wav[2]!, wav[3]!)).toBe('RIFF')
    expect(String.fromCharCode(wav[8]!, wav[9]!, wav[10]!, wav[11]!)).toBe('WAVE')
    expect([...wav.slice(44)]).toEqual([1, 0, 2, 0])
  })
})
