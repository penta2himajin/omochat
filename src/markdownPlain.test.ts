import { describe, expect, it } from 'vitest'
import { markdownToPlainGlasses } from './markdownPlain.ts'
import { wrapMessageLines } from './display.ts'

describe('markdownToPlainGlasses', () => {
  it('strips bold and italic markers', () => {
    expect(markdownToPlainGlasses('**結論**: 晴れです')).toBe('結論: 晴れです')
    expect(markdownToPlainGlasses('これは*朝*です')).toBe('これは朝です')
    expect(markdownToPlainGlasses('__太字__と_斜体_')).toBe('太字と斜体')
  })

  it('strips inline code and links', () => {
    expect(markdownToPlainGlasses('実行は`npm test`')).toBe('実行はnpm test')
    expect(markdownToPlainGlasses('詳細は[ここ](https://example.com)')).toBe('詳細はここ')
  })

  it('turns list markers into ・', () => {
    const raw = ['**準備**', '- 傘は不要', '* 帽子を持つ', '1. 出発する'].join('\n')
    expect(markdownToPlainGlasses(raw)).toBe(
      ['準備', '・傘は不要', '・帽子を持つ', '・出発する'].join('\n'),
    )
  })

  it('strips heading hashes and fence fences', () => {
    const raw = ['## 見出し', '```', 'code line', '```', '本文'].join('\n')
    expect(markdownToPlainGlasses(raw)).toBe(['見出し', 'code line', '本文'].join('\n'))
  })
})

describe('wrapMessageLines markdown flatten', () => {
  it('does not show ** markers on the glasses lines', () => {
    const lines = wrapMessageLines({
      role: 'assistant',
      content: '**結論**: 明日は晴れです。\n- 傘は不要',
    })
    const joined = lines.join('\n')
    expect(joined).toContain('AI: 結論: 明日は晴れです。')
    expect(joined).toContain('・傘は不要')
    expect(joined).not.toContain('**')
    expect(joined).not.toContain('- 傘')
  })
})
