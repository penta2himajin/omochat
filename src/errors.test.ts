import { describe, expect, it } from 'vitest'
import { formatThrownError, phaseLabel } from './errors.ts'
import { OpenAiClientError } from './openai/client.ts'

describe('formatThrownError', () => {
  it('formats OpenAiClientError with status and code', () => {
    const err = formatThrownError(
      new OpenAiClientError(503, 'Model not downloaded. Open omoserv and tap Download model.', 'model_not_ready'),
      'generation',
    )
    expect(err.phase).toBe('generation')
    expect(err.message).toContain('503')
    expect(err.message).toContain('Model not downloaded')
    expect(err.message).toContain('model_not_ready')
  })

  it('formats plain objects with message instead of [object Object]', () => {
    const err = formatThrownError({ status: 401, message: 'Invalid API token', code: 'invalid_api_key' }, 'generation')
    expect(err.message).not.toContain('[object Object]')
    expect(err.message).toContain('Invalid API token')
  })
})

describe('phaseLabel', () => {
  it('labels generation as chat generation', () => {
    expect(phaseLabel('generation')).toBe('chat generation')
  })
})
