import { phaseLabel, type AppError } from './errors.ts'

export const APP_VERSION = '0.0.10'
export const TEXT_UPGRADE_MAX = 2000

export type Mode = 'loading' | 'idle' | 'thinking' | 'error'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

export type LoadingStep = 'webgpu' | 'cdn-import' | 'engine-create' | 'conversation-create' | 'done'

export type DisplayState = {
  mode: Mode
  selectedPromptIndex: number
  promptCount: number
  messages: ChatMessage[]
  streamingTail: string
  loadingStep?: LoadingStep
  webGpu: boolean
  webGpuAdapter: string | null
  webGpuDetail: string
  secureContext: boolean
  crossOriginIsolated: boolean
  protocol: string
  userAgent: string
  modelLabel: string
  backendLabel: string
  error?: AppError
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

export function formatHubText(state: DisplayState): string {
  const lines: string[] = []
  lines.push(`omochat v${APP_VERSION}`)
  lines.push(`mode: ${state.mode}`)

  if (state.mode === 'loading' && state.loadingStep) {
    const label =
      state.loadingStep === 'cdn-import'
        ? 'litert-lm wasm'
        : state.loadingStep
    lines.push(`step: ${label}`)
  }

  lines.push(`webgpu-api: ${state.webGpu ? 'yes' : 'no'}`)
  lines.push(`webgpu-adapter: ${state.webGpuAdapter ?? 'none'}`)
  if (state.webGpuDetail) lines.push(`webgpu: ${state.webGpuDetail}`)
  lines.push(`backend: ${state.backendLabel}`)
  lines.push(`secure: ${state.secureContext ? 'yes' : 'no'}`)
  lines.push(`coi: ${state.crossOriginIsolated ? 'yes' : 'no'}`)
  lines.push(`proto: ${state.protocol}`)
  lines.push(`ua: ${state.userAgent}`)
  lines.push(`model: ${state.modelLabel}`)

  if (state.mode === 'error' && state.error) {
    lines.push('')
    lines.push(`ERR @ ${phaseLabel(state.error.phase)}`)
    lines.push(clip(state.error.message, 240))
    if (state.error.detail) {
      lines.push('')
      lines.push(clip(state.error.detail.replace(/\s+/g, ' '), 360))
    }
  }

  if (state.mode === 'idle') {
    lines.push(`prompt: ${state.selectedPromptIndex + 1}/${state.promptCount}`)
    lines.push('press: send / double: next')
  }
  if (state.mode === 'thinking') lines.push('press: cancel')

  lines.push('')
  for (const m of state.messages.slice(-6)) {
    lines.push(`${m.role === 'user' ? 'You' : 'AI'}: ${clip(m.content, 120)}`)
  }

  if (state.mode === 'thinking' && state.streamingTail) {
    lines.push('')
    lines.push(`AI: ${clip(state.streamingTail, 200)}`)
  }

  const out = lines.join('\n')
  return out.length > TEXT_UPGRADE_MAX ? clip(out, TEXT_UPGRADE_MAX) : out
}
