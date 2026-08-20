export const API_BASE_URL_KEY = 'omochat.api.baseUrl'
export const API_TOKEN_KEY = 'omochat.api.token'

export type OmochatApiConfig = {
  baseUrl: string
  token: string
}

export type ConfigStorage = {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
}

export function isApiConfigComplete(config: Partial<OmochatApiConfig> | null | undefined): config is OmochatApiConfig {
  return Boolean(config?.baseUrl?.trim() && config?.token?.trim())
}

export async function loadApiConfig(storage: ConfigStorage): Promise<OmochatApiConfig | null> {
  const baseUrl = (await storage.getItem(API_BASE_URL_KEY))?.trim() ?? ''
  const token = (await storage.getItem(API_TOKEN_KEY))?.trim() ?? ''
  if (!baseUrl || !token) return null
  return { baseUrl, token }
}

export async function saveApiConfig(storage: ConfigStorage, config: OmochatApiConfig): Promise<void> {
  await storage.setItem(API_BASE_URL_KEY, config.baseUrl.trim())
  await storage.setItem(API_TOKEN_KEY, config.token.trim())
}

/** Even Hub bridge adapter. Empty string from getLocalStorage is treated as missing. */
export function evenHubConfigStorage(bridge: {
  getLocalStorage: (key: string) => Promise<string>
  setLocalStorage: (key: string, value: string) => Promise<boolean>
}): ConfigStorage {
  return {
    async getItem(key) {
      const v = await bridge.getLocalStorage(key)
      return v ? v : null
    },
    async setItem(key, value) {
      await bridge.setLocalStorage(key, value)
    },
  }
}

export function browserConfigStorage(store: Storage = localStorage): ConfigStorage {
  return {
    async getItem(key) {
      return store.getItem(key)
    },
    async setItem(key, value) {
      store.setItem(key, value)
    },
  }
}
