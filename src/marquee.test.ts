import { describe, expect, it } from 'vitest'
import { getTextWidth } from '@evenrealities/pretext'
import {
  MARQUEE_GAP,
  marqueeCycleLen,
  marqueeNeeded,
  marqueeSliceByPixels,
} from './marquee.ts'

describe('marqueeSliceByPixels', () => {
  it('advances without ellipsis and wraps with gap', () => {
    const title = 'あいうえおかきくけこさしすせそ'
    const maxPx = getTextWidth('あいうえお')
    expect(marqueeNeeded(title, maxPx)).toBe(true)
    const s0 = marqueeSliceByPixels(title, 0, maxPx)
    expect(s0.includes('…')).toBe(false)
    expect(getTextWidth(s0)).toBeLessThanOrEqual(maxPx)
    const s5 = marqueeSliceByPixels(title, 5, maxPx)
    expect(s5.startsWith('か')).toBe(true)
  })

  it('cycle length is title graphemes plus gap', () => {
    expect(marqueeCycleLen('abc')).toBe(3 + MARQUEE_GAP.length)
  })
})
