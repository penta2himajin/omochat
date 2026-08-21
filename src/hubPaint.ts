export type TextPayloadMetrics = {
  jsLen: number
  utf8Len: number
  lineCount: number
}

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

/** Take a code-point-safe prefix whose UTF-8 encoding is ≤ maxBytes. */
export function takeUtf8Prefix(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return ''
  const enc = new TextEncoder()
  let out = ''
  let used = 0
  for (const ch of text) {
    const n = enc.encode(ch).length
    if (used + n > maxBytes) break
    out += ch
    used += n
  }
  return out
}

/** Measure Hub text payload size (JS UTF-16 length vs UTF-8 wire bytes). */
export function textPayloadMetrics(content: string): TextPayloadMetrics {
  return {
    jsLen: content.length,
    utf8Len: utf8ByteLength(content),
    lineCount: content.length === 0 ? 0 : content.split('\n').length,
  }
}

/** One-line diagnostic for phone preview / console when an upgrade fails. */
export function formatUpgradeFailureNotice(
  viewMode: string,
  metrics: TextPayloadMetrics,
  ok: boolean | undefined,
): string {
  const result = ok === undefined ? 'throw' : ok ? 'ok' : 'fail'
  return `hub ${result} ${viewMode} js=${metrics.jsLen} utf8=${metrics.utf8Len} lines=${metrics.lineCount}`
}

export type UpgradeFn = (content: string) => Promise<boolean>

/**
 * Serialize textContainerUpgrade calls so paints do not overlap on the BLE display channel.
 * Invokes onResult after each attempt (success or failure).
 */
export function createSerializedHubPainter(options: {
  formatContent: () => string
  upgrade: UpgradeFn
  onResult?: (args: {
    ok: boolean | undefined
    content: string
    metrics: TextPayloadMetrics
    error?: unknown
  }) => void
}): { paint: () => void; whenIdle: () => Promise<void> } {
  let chain: Promise<void> = Promise.resolve()

  const paint = () => {
    chain = chain
      .catch(() => undefined)
      .then(async () => {
        const content = options.formatContent()
        const metrics = textPayloadMetrics(content)
        try {
          const ok = await options.upgrade(content)
          options.onResult?.({ ok, content, metrics })
        } catch (error) {
          options.onResult?.({ ok: undefined, content, metrics, error })
        }
      })
  }

  return {
    paint,
    whenIdle: () => chain.then(() => undefined),
  }
}
