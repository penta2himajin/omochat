import { getTextWidth } from '@evenrealities/pretext'

/** glassearch-aligned marquee timing (RESULTS selected row). */
export const MARQUEE_DWELL_MS = 800
export const MARQUEE_TICK_MS = 350
/** ASCII spaces between tail and the wrapped head. */
export const MARQUEE_GAP = '    '

export function marqueeCycleLen(title: string): number {
  return [...title].length + [...MARQUEE_GAP].length
}

/**
 * Fixed grapheme window from a looping `title + gap + title` string.
 * Used when a char budget is known; prefer {@link marqueeSliceByPixels} on G2.
 */
export function marqueeSlice(title: string, shift: number, window: number): string {
  if (window <= 0) return ''
  const loop = [...title, ...MARQUEE_GAP, ...title]
  const start = Math.max(0, shift)
  return loop.slice(start, start + window).join('')
}

/** Pixel-budget slice; no ellipsis (slide phase). */
export function marqueeSliceByPixels(title: string, shift: number, maxPx: number): string {
  if (maxPx <= 0) return ''
  const loop = [...title, ...MARQUEE_GAP, ...title]
  const start = Math.max(0, shift)
  let out = ''
  for (let i = start; i < loop.length; i++) {
    const next = out + loop[i]!
    if (out.length > 0 && getTextWidth(next) > maxPx) break
    out = next
  }
  return out
}

/** True when `title` needs marquee inside `maxPx` (no ellipsis). */
export function marqueeNeeded(title: string, maxPx: number): boolean {
  return getTextWidth(title) > maxPx
}
