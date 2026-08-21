/** PCM 16 kHz s16le mono → WAV (Even G2 / Hub mic format). */
export function pcmToWav(pcm: Uint8Array, sampleRate = 16_000): Uint8Array {
  const channels = 1
  const bits = 16
  const header = new ArrayBuffer(44)
  const view = new DataView(header)
  const dataSize = pcm.byteLength
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * (bits / 8), true)
  view.setUint16(32, channels * (bits / 8), true)
  view.setUint16(34, bits, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataSize, true)
  const out = new Uint8Array(44 + dataSize)
  out.set(new Uint8Array(header), 0)
  out.set(pcm, 44)
  return out
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}
