import { describe, expect, it, vi } from 'vitest'
import {
  createSerializedHubPainter,
  formatUpgradeFailureNotice,
  textPayloadMetrics,
  takeUtf8Prefix,
  utf8ByteLength,
} from './hubPaint.ts'

describe('textPayloadMetrics', () => {
  it('reports UTF-8 bytes larger than JS length for CJK', () => {
    const content = 'あ'.repeat(100)
    const m = textPayloadMetrics(content)
    expect(m.jsLen).toBe(100)
    expect(m.utf8Len).toBe(300)
    expect(m.lineCount).toBe(1)
  })

  it('counts lines', () => {
    expect(textPayloadMetrics('a\nb\nc').lineCount).toBe(3)
  })
})

describe('takeUtf8Prefix', () => {
  it('does not split a CJK code point and respects the byte budget', () => {
    const text = 'あいうえお'
    const clipped = takeUtf8Prefix(text, 7) // 2 chars = 6 bytes, 3rd would be 9
    expect(clipped).toBe('あい')
    expect(utf8ByteLength(clipped)).toBeLessThanOrEqual(7)
  })
})

describe('formatUpgradeFailureNotice', () => {
  it('formats fail metrics for the phone preview', () => {
    const notice = formatUpgradeFailureNotice('history', { jsLen: 1990, utf8Len: 5500, lineCount: 70 }, false)
    expect(notice).toContain('hub fail')
    expect(notice).toContain('history')
    expect(notice).toContain('js=1990')
    expect(notice).toContain('utf8=5500')
    expect(notice).toContain('lines=70')
  })
})

describe('createSerializedHubPainter', () => {
  it('awaits upgrades in order and reports boolean results', async () => {
    const order: string[] = []
    const upgrade = vi.fn(async (content: string) => {
      order.push(`start:${content}`)
      await Promise.resolve()
      order.push(`end:${content}`)
      return content !== 'bad'
    })
    const results: Array<boolean | undefined> = []
    const queue = ['a', 'bad', 'c']
    const { paint, whenIdle } = createSerializedHubPainter({
      formatContent: () => queue.shift() ?? '',
      upgrade,
      onResult: ({ ok }) => {
        results.push(ok)
      },
    })

    paint()
    paint()
    paint()
    await whenIdle()

    expect(upgrade).toHaveBeenCalledTimes(3)
    expect(order).toEqual(['start:a', 'end:a', 'start:bad', 'end:bad', 'start:c', 'end:c'])
    expect(results).toEqual([true, false, true])
  })
})
