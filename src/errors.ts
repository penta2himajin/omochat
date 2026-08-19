export type ErrorPhase =
  | 'webgpu'
  | 'cdn-import'
  | 'engine-create'
  | 'conversation-create'
  | 'generation'
  | 'evenhub'
  | 'unknown'

export type AppError = {
  phase: ErrorPhase
  message: string
  detail?: string
}

export function formatThrownError(err: unknown, phase: ErrorPhase): AppError {
  if (err instanceof Error) {
    const detail = err.stack?.split('\n').slice(0, 4).join('\n')
    return { phase, message: err.message || err.name || 'Error', detail }
  }
  return { phase, message: String(err) }
}

export function phaseLabel(phase: ErrorPhase): string {
  switch (phase) {
    case 'webgpu':
      return 'WebGPU check'
    case 'cdn-import':
      return 'LiteRT-LM CDN import'
    case 'engine-create':
      return 'Engine.create (model load)'
    case 'conversation-create':
      return 'createConversation'
    case 'generation':
      return 'sendMessageStreaming'
    case 'evenhub':
      return 'EvenHub bridge'
    default:
      return 'unknown'
  }
}
