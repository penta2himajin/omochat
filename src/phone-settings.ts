import type { ConfigStorage, OmochatApiConfig } from './openai/config.ts'
import { isApiConfigComplete, loadApiConfig, saveApiConfig } from './openai/config.ts'
import { createOpenAiClient } from './openai/client.ts'

const DEFAULT_BASE_URL = 'http://127.0.0.1:8765/v1'

export function mountPhoneSettings(
  root: HTMLElement,
  storage: ConfigStorage,
  onSaved?: (config: OmochatApiConfig | null) => void,
): { refresh: () => Promise<void> } {
  root.innerHTML = `
    <section class="settings">
      <h2>omoserv 設定</h2>
      <p class="muted">omoserv アプリから URL とトークンをコピーして貼り付けてください。</p>
      <label>API Base URL
        <input id="api-base" type="url" autocomplete="off" spellcheck="false" />
      </label>
      <label>API Token
        <input id="api-token" type="password" autocomplete="off" spellcheck="false" />
      </label>
      <div class="settings-actions">
        <button type="button" id="api-save">保存</button>
        <button type="button" id="api-test">接続テスト</button>
      </div>
      <p id="api-status" class="settings-status"></p>
    </section>
  `

  const baseInput = root.querySelector<HTMLInputElement>('#api-base')!
  const tokenInput = root.querySelector<HTMLInputElement>('#api-token')!
  const status = root.querySelector<HTMLElement>('#api-status')!

  const refresh = async () => {
    const cfg = await loadApiConfig(storage)
    baseInput.value = cfg?.baseUrl ?? DEFAULT_BASE_URL
    tokenInput.value = cfg?.token ?? ''
    status.textContent = cfg ? '設定済み' : '未設定'
  }

  root.querySelector('#api-save')?.addEventListener('click', () => {
    void (async () => {
      const config = {
        baseUrl: baseInput.value.trim(),
        token: tokenInput.value.trim(),
      }
      if (!isApiConfigComplete(config)) {
        status.textContent = 'URL とトークンを入力してください'
        return
      }
      await saveApiConfig(storage, config)
      status.textContent = '保存しました'
      onSaved?.(config)
    })()
  })

  root.querySelector('#api-test')?.addEventListener('click', () => {
    void (async () => {
      const config = {
        baseUrl: baseInput.value.trim(),
        token: tokenInput.value.trim(),
      }
      if (!isApiConfigComplete(config)) {
        status.textContent = 'URL とトークンを入力してください'
        return
      }
      status.textContent = 'テスト中…'
      try {
        const client = createOpenAiClient(config)
        const models = await client.listModels()
        status.textContent = `OK: ${models.map((m) => m.id).join(', ') || '(no models)'}`
      } catch (err) {
        const msg =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message: unknown }).message)
            : String(err)
        status.textContent = `失敗: ${msg}`
      }
    })()
  })

  void refresh()
  return { refresh }
}
