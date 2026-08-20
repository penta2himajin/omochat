import { describe, expect, it } from 'vitest'
import {
  API_BASE_URL_KEY,
  API_TOKEN_KEY,
  isApiConfigComplete,
  loadApiConfig,
  saveApiConfig,
  type ConfigStorage,
} from './config.ts'

function memoryStorage(initial: Record<string, string> = {}): ConfigStorage & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    async getItem(key) {
      return data[key] ?? null
    },
    async setItem(key, value) {
      data[key] = value
    },
  }
}

describe('api config storage', () => {
  it('returns null when incomplete', async () => {
    const storage = memoryStorage({ [API_BASE_URL_KEY]: 'http://127.0.0.1:8765/v1' })
    expect(await loadApiConfig(storage)).toBeNull()
  })

  it('round-trips complete config', async () => {
    const storage = memoryStorage()
    await saveApiConfig(storage, {
      baseUrl: ' http://127.0.0.1:8765/v1 ',
      token: ' omoserv_abc ',
    })
    expect(storage.data[API_BASE_URL_KEY]).toBe('http://127.0.0.1:8765/v1')
    expect(storage.data[API_TOKEN_KEY]).toBe('omoserv_abc')
    expect(await loadApiConfig(storage)).toEqual({
      baseUrl: 'http://127.0.0.1:8765/v1',
      token: 'omoserv_abc',
    })
  })

  it('isApiConfigComplete guards empty fields', () => {
    expect(isApiConfigComplete({ baseUrl: '', token: 'x' })).toBe(false)
    expect(isApiConfigComplete({ baseUrl: 'http://x', token: 'y' })).toBe(true)
  })
})
