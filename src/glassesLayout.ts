import { getTextWidth } from '@evenrealities/pretext'

/** Even G2 canvas (per eye). */
export const GLASSES_CANVAS_WIDTH = 576
export const GLASSES_CANVAS_HEIGHT = 288
/** Matches TextContainerProperty in main.ts. */
export const GLASSES_PADDING_LENGTH = 4
export const GLASSES_BORDER_WIDTH = 0
/** Firmware LVGL line height (@evenrealities/pretext). */
export const GLASSES_LINE_HEIGHT_PX = 27

export const GLASSES_CONTENT_WIDTH =
  GLASSES_CANVAS_WIDTH - 2 * (GLASSES_PADDING_LENGTH + GLASSES_BORDER_WIDTH)
export const GLASSES_CONTENT_HEIGHT =
  GLASSES_CANVAS_HEIGHT - 2 * (GLASSES_PADDING_LENGTH + GLASSES_BORDER_WIDTH)

/** Rows that fit the content box without firmware scroll. */
export const GLASSES_VIEWPORT_LINES = Math.floor(GLASSES_CONTENT_HEIGHT / GLASSES_LINE_HEIGHT_PX)

function isCjk(cp: number): boolean {
  return (cp >= 0x2e80 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xac00 && cp <= 0xd7af)
}

function isBreakable(cp: number): boolean {
  return cp === 32 || cp === 45 || isCjk(cp)
}

/**
 * Wrap text to pixel width using the same break rules as EvenHub / pretext measureTextWrap.
 * Returns one string per visual line (no trailing newlines).
 */
export function wrapByPixels(text: string, maxWidth: number = GLASSES_CONTENT_WIDTH): string[] {
  if (!text) return []
  const chars = Array.from(text)
  const cps = chars.map((c) => c.codePointAt(0)!)
  const lines: string[] = []
  let lineStart = 0
  let currentWidth = 0
  let lastBreakIdx = -1
  let i = 0

  while (i < cps.length) {
    const cp = cps[i]!
    if (cp === 10) {
      lines.push(chars.slice(lineStart, i).join(''))
      lineStart = i + 1
      currentWidth = 0
      lastBreakIdx = -1
      i++
      continue
    }
    if (currentWidth === 0 && cp === 32) {
      lineStart = i + 1
      i++
      continue
    }

    const newWidth = getTextWidth(chars.slice(lineStart, i + 1).join(''))

    if (newWidth > maxWidth) {
      if (cp === 32) {
        lines.push(chars.slice(lineStart, i).join(''))
        lineStart = i + 1
        currentWidth = 0
        lastBreakIdx = -1
        i++
      } else if (lastBreakIdx !== -1) {
        const breakCp = cps[lastBreakIdx]!
        if (breakCp === 32) {
          lines.push(chars.slice(lineStart, lastBreakIdx).join(''))
          lineStart = lastBreakIdx + 1
        } else {
          lines.push(chars.slice(lineStart, lastBreakIdx + 1).join(''))
          lineStart = lastBreakIdx + 1
        }
        currentWidth = 0
        lastBreakIdx = -1
        i = lineStart
      } else if (i === lineStart) {
        lines.push(chars[i]!)
        lineStart = i + 1
        currentWidth = 0
        lastBreakIdx = -1
        i++
      } else {
        lines.push(chars.slice(lineStart, i).join(''))
        lineStart = i
        currentWidth = 0
        lastBreakIdx = -1
      }
    } else {
      currentWidth = newWidth
      if (isBreakable(cp)) {
        lastBreakIdx = i
      }
      i++
    }
  }
  lines.push(chars.slice(lineStart).join(''))
  return lines
}

/** Clip to pixel budget; appends … when truncated. */
export function clipByPixels(text: string, maxPx: number, ellipsis = '…'): string {
  if (maxPx <= 0) return ''
  if (getTextWidth(text) <= maxPx) return text
  const chars = Array.from(text)
  let lo = 0
  let hi = chars.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (getTextWidth(chars.slice(0, mid).join('') + ellipsis) <= maxPx) lo = mid
    else hi = mid - 1
  }
  return chars.slice(0, lo).join('') + ellipsis
}

/** Full-width rule sized to the content box (firmware glyph metrics). */
export function buildTitleSeparator(maxWidth: number = GLASSES_CONTENT_WIDTH): string {
  let s = ''
  while (getTextWidth(s + '━') <= maxWidth) s += '━'
  return s
}
