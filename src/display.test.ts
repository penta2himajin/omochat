import { describe, expect, it } from 'vitest'
import { formatHubText, type DisplayState } from './display.ts'

const baseEnv = {
  origin: 'http://127.0.0.1:41791',
  protocol: 'http:',
  secureContext: true,
  crossOriginIsolated: false,
  uaFull: 'test-ua',
  uad: null,
  webgl2: true,
  webglRenderer: 'test-gpu',
  webgpu: { status: 'unsupported' as const, reason: 'no-adapter' as const, detail: 'null' },
}

function minimalState(overrides: Partial<DisplayState>): DisplayState {
  return {
    mode: 'idle',
    selectedPromptIndex: 0,
    promptCount: 1,
    messages: [],
    streamingTail: '',
    env: baseEnv,
    companion: {
      status: 'fail',
      url: 'http://127.0.0.1:8765/hello',
      detail: 'network error',
    },
    modelLabel: '(test)',
    probeOnly: false,
    companionProbe: false,
    ...overrides,
  }
}

describe('formatHubText companion section', () => {
  it('always includes companion lines after a probe attempt', () => {
    const text = formatHubText(minimalState({}))
    expect(text).toContain('companion: fail')
    expect(text).toContain('companion-url: http://127.0.0.1:8765/hello')
    expect(text).toContain('companion-detail: network error')
  })

  it('includes companion ok body when present', () => {
    const text = formatHubText(
      minimalState({
        companion: {
          status: 'ok',
          url: 'http://127.0.0.1:8765/hello',
          body: 'Hello, world',
          detail: 'HTTP 200',
        },
      }),
    )
    expect(text).toContain('companion: ok')
    expect(text).toContain('companion-body: Hello, world')
  })

  it('shows companion skip when explicitly disabled', () => {
    const text = formatHubText(
      minimalState({
        companion: { status: 'skip', url: '', detail: 'disabled' },
      }),
    )
    expect(text).toContain('companion: skip')
  })
})
