/**
 * Flatten Markdown to plain text suitable for Even G2 TextContainer
 * (no bold/italic/fonts — markers would otherwise show literally).
 */
export function markdownToPlainGlasses(input: string): string {
  let text = input.replace(/\r\n/g, '\n')

  // Fenced code blocks → inner text only.
  text = text.replace(/```[\w-]*\n?([\s\S]*?)```/g, (_m, body: string) => body.replace(/\n$/, ''))

  const lines = text.split('\n').map((line) => flattenLine(line))
  // Collapse runs of blank lines to a single blank.
  const out: string[] = []
  for (const line of lines) {
    if (line === '' && out[out.length - 1] === '') continue
    out.push(line)
  }
  return out.join('\n').trim()
}

function flattenLine(line: string): string {
  let s = line

  // ATX headings.
  s = s.replace(/^\s{0,3}#{1,6}\s+/, '')

  // Unordered / ordered list markers → ・
  s = s.replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+/, '・')

  // Images ![alt](url) → alt
  s = s.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
  // Links [text](url) → text
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

  // Bold / italic / strikethrough / inline code (order: longer fences first).
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1')
  s = s.replace(/__([^_]+)__/g, '$1')
  s = s.replace(/~~([^~]+)~~/g, '$1')
  s = s.replace(/`([^`]+)`/g, '$1')
  // Single * / _ emphasis (avoid matching list leftovers).
  s = s.replace(/(^|[^\w*])\*([^*\n]+)\*(?!\*)/g, '$1$2')
  s = s.replace(/(^|[^\w_])_([^_\n]+)_(?!_)/g, '$1$2')

  return s.trimEnd()
}
