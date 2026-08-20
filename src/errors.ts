export type ErrorPhase =
  | 'webgpu'
  | 'companion'
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

function messageFromUnknown(err: unknown): string {
  if (err instanceof Error) return err.message || err.name || 'Error'
  if (err && typeof err === 'object') {
    const o = err as { message?: unknown; code?: unknown; status?: unknown }
    if (typeof o.message === 'string' && o.message.trim()) {
      const bits = [o.message]
      if (typeof o.status === 'number') bits.unshift(`HTTP ${o.status}`)
      if (typeof o.code === 'string' && o.code) bits.push(`(${o.code})`)
      return bits.join(' ')
    }
  }
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

export function formatThrownError(err: unknown, phase: ErrorPhase): AppError {
  if (err instanceof Error) {
    const detail = err.stack?.split('\n').slice(0, 4).join('\n')
    const base: AppError = { phase, message: err.message || err.name || 'Error', detail }
    if ('status' in err && typeof (err as { status?: unknown }).status === 'number') {
      const status = (err as { status: number }).status
      const code = 'code' in err && typeof (err as { code?: unknown }).code === 'string'
        ? (err as { code: string }).code
        : undefined
      base.message = code ? `HTTP ${status}: ${base.message} (${code})` : `HTTP ${status}: ${base.message}`
    }
    return base
  }
  return { phase, message: messageFromUnknown(err) }
}

export function phaseLabel(phase: ErrorPhase): string {
  switch (phase) {
    case 'webgpu':
      return 'WebGPU check'
    case 'companion':
      return 'omoserv HTTP probe'
    case 'cdn-import':
      return 'LiteRT-LM CDN import'
    case 'engine-create':
      return 'Engine.create (model load)'
    case 'conversation-create':
      return 'createConversation'
    case 'generation':
      return 'chat generation'
    case 'evenhub':
      return 'EvenHub bridge'
    default:
      return 'unknown'
  }
}
