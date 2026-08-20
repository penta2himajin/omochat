import './style.css'
import { Backend, Engine, getGlobalLiteRtLm, loadLiteRtLm } from '@litert-lm/core'
import {
  CreateStartUpPageContainer,
  OsEventTypeList,
  TextContainerProperty,
  TextContainerUpgrade,
  waitForEvenAppBridge,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk'
import { formatHubText, type DisplayState, type LoadingStep, type Mode } from './display.ts'
import { copyEnvProbe, runEnvProbe, type EnvProbeResult } from './env/probe.ts'
import { probeCompanion, type CompanionProbeResult } from './companion/probe.ts'
import { formatThrownError, type AppError } from './errors.ts'
import { installWebGpuDevice, type WebGpuAvailability } from './webgpu.ts'
import { resolveStartupOptions } from './startup.ts'
import { createOpenAiClient, type OpenAiClient } from './openai/client.ts'
import {
  browserConfigStorage,
  evenHubConfigStorage,
  isApiConfigComplete,
  loadApiConfig,
  type ConfigStorage,
  type OmochatApiConfig,
} from './openai/config.ts'
import { mountPhoneSettings } from './phone-settings.ts'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const MODEL_URL_GEMMA4_E4B =
  'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.litertlm'

const PROMPTS = [
  'こんにちは。短く自己紹介して。',
  'WebGPUについて、子どもにもわかるように説明して。',
  '日本の四季の特徴を、各1行で教えて。',
  '次に何を聞けばいい？おすすめの質問を3つ出して。',
]

function evenHubHostPresent(): boolean {
  const w = window as unknown as { flutter_inappwebview?: { callHandler?: unknown } }
  return typeof w.flutter_inappwebview?.callHandler === 'function'
}

function pickHubInputEvent(event: EvenHubEvent) {
  return event.textEvent ?? event.listEvent ?? event.sysEvent
}

function normalizeHubEventType(raw: unknown): OsEventTypeList | undefined {
  if (raw === undefined || raw === null) return undefined
  const parsed = OsEventTypeList.fromJson(raw)
  if (parsed !== undefined) return parsed
  if (typeof raw === 'number' && raw >= 0 && raw <= 8) return raw as OsEventTypeList
  return undefined
}

function handleEvenHubInput(
  event: EvenHubEvent,
  handlers: { press: () => void; doublePress: () => void; swipeUp: () => void; swipeDown: () => void },
) {
  const ev = pickHubInputEvent(event)
  if (!ev) return
  const type = normalizeHubEventType(ev.eventType)

  if (
    type === OsEventTypeList.IMU_DATA_REPORT ||
    type === OsEventTypeList.FOREGROUND_ENTER_EVENT ||
    type === OsEventTypeList.FOREGROUND_EXIT_EVENT ||
    type === OsEventTypeList.ABNORMAL_EXIT_EVENT ||
    type === OsEventTypeList.SYSTEM_EXIT_EVENT
  ) {
    return
  }

  switch (type) {
    case OsEventTypeList.CLICK_EVENT:
    case undefined:
      handlers.press()
      break
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      handlers.doublePress()
      break
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      handlers.swipeDown()
      break
    case OsEventTypeList.SCROLL_TOP_EVENT:
      handlers.swipeUp()
      break
    default:
      break
  }
}

function modelLabelFromUrl(url: string): string {
  try {
    return new URL(url).pathname.split('/').pop() ?? url
  } catch {
    return url
  }
}

function appendToTail(current: string, next: string) {
  return current + next
}

function stripThinkBlock(text: string): string {
  const start = text.indexOf('<think>')
  if (start < 0) return text.trim()
  const end = text.indexOf('</think>', start)
  if (end < 0) return text.slice(0, start).trim()
  return (text.slice(0, start) + text.slice(end + 8)).trim()
}

type LmBundle = {
  engine: { delete: () => Promise<void>; cancel?: () => void }
  conversation: {
    cancel?: () => void
    sendMessageStreaming: (prompt: string) => AsyncIterable<unknown>
  }
}

const LITERT_LM_WASM_PATH = '/litert-lm/wasm/'

async function createLmConversation(
  modelUrl: string,
  webgpu: WebGpuAvailability,
  onStep: (step: LoadingStep) => void,
): Promise<LmBundle> {
  if (webgpu.status !== 'supported') {
    throw Object.assign(
      formatThrownError(new Error(`WebGPU ${webgpu.reason ?? 'unsupported'}: ${webgpu.detail}`), 'webgpu'),
      { phase: 'webgpu' },
    )
  }

  onStep('cdn-import')
  try {
    await loadLiteRtLm(LITERT_LM_WASM_PATH)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('already loading') || msg.includes('already loaded')) {
      // ignore
    } else {
      throw Object.assign(formatThrownError(err, 'cdn-import'), { phase: 'cdn-import' })
    }
  }

  onStep('engine-create')
  try {
    const wasm = getGlobalLiteRtLm().liteRtLmWasm
    await installWebGpuDevice(wasm, webgpu)
  } catch (err) {
    throw Object.assign(formatThrownError(err, 'webgpu'), { phase: 'webgpu' })
  }

  let engine: LmBundle['engine']
  try {
    engine = await Engine.create({
      model: modelUrl,
      backend: Backend.GPU_ARTISAN,
    } as any)
  } catch (err) {
    throw Object.assign(formatThrownError(err, 'engine-create'), { phase: 'engine-create' })
  }

  onStep('conversation-create')
  try {
    const conversation = await (engine as unknown as { createConversation: (cfg: unknown) => Promise<LmBundle['conversation']> }).createConversation({
      preface: {
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful assistant. Answer in Japanese. Keep responses short and useful for a wearable display.',
          },
        ],
      },
    })
    return { engine, conversation }
  } catch (err) {
    await engine.delete().catch(() => {})
    throw Object.assign(formatThrownError(err, 'conversation-create'), { phase: 'conversation-create' })
  }
}

function mountWebUi(root: HTMLElement) {
  const settings = document.createElement('div')
  settings.id = 'phone-settings'

  const status = document.createElement('div')
  status.className = 'status'

  const chat = document.createElement('div')
  chat.className = 'chat'

  const controls = document.createElement('div')
  controls.className = 'controls'

  const input = document.createElement('textarea')
  input.placeholder = 'debug: ここに入力して Enter または 送信'

  const sendBtn = document.createElement('button')
  sendBtn.textContent = '送信'

  const copyBtn = document.createElement('button')
  copyBtn.textContent = '診断コピー'
  copyBtn.type = 'button'

  controls.appendChild(input)
  controls.appendChild(sendBtn)
  controls.appendChild(copyBtn)

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendBtn.click()
    }
  })

  root.appendChild(settings)
  root.appendChild(status)
  root.appendChild(chat)
  root.appendChild(controls)

  return {
    settingsRoot: settings,
    setStatus: (text: string) => {
      status.textContent = text
    },
    setChatText: (text: string) => {
      chat.textContent = text
    },
    getInput: () => input.value.trim(),
    clearInput: () => {
      input.value = ''
    },
    onSend: (fn: () => void) => sendBtn.addEventListener('click', fn),
    onCopyDiagnostics: (fn: () => void) => copyBtn.addEventListener('click', fn),
    setSendDisabled: (v: boolean) => {
      sendBtn.disabled = v
    },
  }
}

function toDisplayState(args: {
  mode: Mode
  selectedPromptIndex: number
  messages: ChatMessage[]
  streamingTail: string
  loadingStep?: LoadingStep
  modelUrl: string
  env: EnvProbeResult
  companion: CompanionProbeResult
  probeOnly: boolean
  companionProbe: boolean
  error?: AppError
}): DisplayState {
  return {
    mode: args.mode,
    selectedPromptIndex: args.selectedPromptIndex,
    promptCount: PROMPTS.length,
    messages: args.messages,
    streamingTail: args.streamingTail,
    loadingStep: args.loadingStep,
    env: args.env,
    companion: args.companion,
    modelLabel: modelLabelFromUrl(args.modelUrl),
    probeOnly: args.probeOnly,
    companionProbe: args.companionProbe,
    error: args.error,
  }
}

async function main() {
  const root = document.querySelector('#app')! as HTMLElement
  const ui = mountWebUi(root)

  const userModelUrl = import.meta.env.VITE_MODEL_URL || MODEL_URL_GEMMA4_E4B
  const evenHub = evenHubHostPresent()
  const { probeOnly, companionProbe, shouldProbeCompanion, skipModelLoad } = resolveStartupOptions(
    window.location.search,
    evenHub,
  )

  let mode: Mode = 'loading'
  let loadingStep: LoadingStep | undefined = 'env-probe'
  let selectedPromptIndex = 0
  let messages: ChatMessage[] = []
  let streamingTail = ''
  let error: AppError | undefined

  let engine: LmBundle['engine'] | null = null
  let conversation: LmBundle['conversation'] | null = null
  let openaiClient: OpenAiClient | null = null
  let apiConfig: OmochatApiConfig | null = null
  let backendKind: 'webgpu' | 'omoserv' | 'none' = 'none'

  let hubPaint: (() => void) | null = null
  let configStorage: ConfigStorage = browserConfigStorage()
  let envProbe: EnvProbeResult = {
    origin: '',
    protocol: '',
    secureContext: false,
    crossOriginIsolated: false,
    uaFull: '',
    uad: null,
    webgl2: false,
    webglRenderer: null,
    webgpu: { status: 'unsupported', detail: 'not probed' },
  }
  let companionResult: CompanionProbeResult = {
    status: 'skip',
    url: '',
    detail: 'not probed',
  }
  let activeModelUrl = userModelUrl

  const display = (): DisplayState =>
    toDisplayState({
      mode,
      selectedPromptIndex,
      messages,
      streamingTail,
      loadingStep,
      modelUrl: activeModelUrl,
      env: envProbe,
      companion: companionResult,
      probeOnly,
      companionProbe,
      error,
    })

  const render = () => {
    const text = formatHubText(display())
    ui.setChatText(text)
    ui.setStatus(
      mode === 'loading'
        ? `loading (${loadingStep ?? '…'})`
        : mode === 'idle'
          ? 'idle'
          : mode === 'thinking'
            ? 'generating…'
            : error
              ? `error @ ${error.phase}: ${error.message}`
              : mode,
    )
    hubPaint?.()
  }

  const fail = (err: unknown, phase: AppError['phase']) => {
    error = err && typeof err === 'object' && 'phase' in err && 'message' in err ? (err as AppError) : formatThrownError(err, phase)
    mode = 'error'
    loadingStep = undefined
    streamingTail = ''
    render()
    console.error('[omochat]', error)
  }

  const copyDiagnostics = async () => {
    const ok = await copyEnvProbe(envProbe)
    ui.setStatus(ok ? 'diagnostics copied' : 'copy failed')
  }

  const canChat = () => backendKind === 'webgpu' || backendKind === 'omoserv'

  const applyApiConfig = (config: OmochatApiConfig | null) => {
    apiConfig = config
    if (backendKind === 'webgpu') return
    if (isApiConfigComplete(config)) {
      openaiClient = createOpenAiClient(config)
      backendKind = 'omoserv'
      activeModelUrl = '(omoserv OpenAI API)'
      if (mode === 'error' && error?.phase === 'companion') {
        error = undefined
        mode = 'idle'
      }
    } else if (backendKind === 'omoserv') {
      openaiClient = null
      backendKind = 'none'
      activeModelUrl = '(omoserv: configure API in phone settings)'
    }
    render()
  }

  const startGeneration = async (prompt: string) => {
    if (mode === 'thinking') return
    if (!conversation && !openaiClient) return

    mode = 'thinking'
    streamingTail = ''
    error = undefined
    render()

    messages = [...messages, { role: 'user', content: prompt }]
    let assistantDraft = ''
    let lastUiRenderTs = performance.now()

    try {
      if (openaiClient) {
        const history = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }))
        const stream = openaiClient.streamChatCompletion({
          model: 'gemma-4-e2b',
          messages: [
            {
              role: 'system',
              content:
                'You are a helpful assistant. Answer in Japanese. Keep responses short and useful for a wearable display.',
            },
            ...history,
          ],
        })
        for await (const chunk of stream) {
          assistantDraft = appendToTail(assistantDraft, chunk)
          streamingTail = stripThinkBlock(assistantDraft)
          const now = performance.now()
          if (now - lastUiRenderTs > 50) {
            lastUiRenderTs = now
            render()
          }
          if (mode !== 'thinking') break
        }
      } else if (conversation) {
        conversation.cancel?.()
        const stream = conversation.sendMessageStreaming(prompt)
        for await (const chunk of stream) {
          const items = (chunk as { content?: Array<{ type?: string; text?: string }> })?.content
          if (Array.isArray(items)) {
            for (const item of items) {
              if (item?.type === 'text' && typeof item.text === 'string') {
                assistantDraft = appendToTail(assistantDraft, item.text)
              } else if (typeof item?.text === 'string') {
                assistantDraft = appendToTail(assistantDraft, item.text)
              }
            }
          } else if (typeof (chunk as { text?: string })?.text === 'string') {
            assistantDraft = appendToTail(assistantDraft, (chunk as { text: string }).text)
          }

          streamingTail = stripThinkBlock(assistantDraft)
          const now = performance.now()
          if (now - lastUiRenderTs > 50) {
            lastUiRenderTs = now
            render()
          }
          if (mode !== 'thinking') break
        }
      }

      if (mode === 'thinking') {
        messages = [...messages, { role: 'assistant', content: stripThinkBlock(assistantDraft) }]
        mode = 'idle'
        streamingTail = ''
        render()
      }
    } catch (err) {
      fail(err, 'generation')
    }
  }

  const cancelGeneration = () => {
    if (mode !== 'thinking') return
    mode = 'idle'
    streamingTail = ''
    conversation?.cancel?.()
    render()
  }

  const promptFromSelection = () => PROMPTS[Math.max(0, Math.min(PROMPTS.length - 1, selectedPromptIndex))] ?? 'こんにちは。'

  ui.onSend(() => {
    const q = ui.getInput()
    if (q) void startGeneration(q)
  })
  ui.onCopyDiagnostics(() => {
    void copyDiagnostics()
  })

  render()

  mountPhoneSettings(ui.settingsRoot, configStorage, (cfg) => {
    applyApiConfig(cfg)
  })

  try {
    mode = 'loading'
    loadingStep = 'env-probe'
    error = undefined
    envProbe = await runEnvProbe()
    render()

    if (shouldProbeCompanion) {
      loadingStep = 'companion-probe'
      render()
      companionResult = await probeCompanion()
      render()
    } else {
      companionResult = { status: 'skip', url: '', detail: 'disabled' }
    }

    if (skipModelLoad) {
      if (companionProbe) {
        activeModelUrl = companionResult.status === 'ok'
          ? '(companionProbe: ok)'
          : '(companionProbe: failed)'
      } else {
        activeModelUrl = '(probeOnly: model not loaded)'
      }
      loadingStep = 'done'
      mode = companionProbe && companionResult.status === 'fail' ? 'error' : 'idle'
      if (mode === 'error') {
        error = formatThrownError(
          new Error(`omoserv unreachable: ${companionResult.detail}`),
          'companion',
        )
      }
      render()
    } else if (envProbe.webgpu.status === 'supported') {
      activeModelUrl = userModelUrl
      const created = await createLmConversation(
        activeModelUrl,
        envProbe.webgpu,
        (step) => {
          loadingStep = step
          render()
        },
      )
      engine = created.engine
      conversation = created.conversation
      openaiClient = null
      backendKind = 'webgpu'
      loadingStep = 'done'
      mode = 'idle'
      render()
    } else {
      const cfg = await loadApiConfig(configStorage)
      if (isApiConfigComplete(cfg)) {
        applyApiConfig(cfg)
        loadingStep = 'done'
        mode = 'idle'
        render()
      } else {
        backendKind = 'none'
        activeModelUrl = '(setup: set omoserv URL/token in phone settings)'
        loadingStep = 'done'
        mode = 'idle'
        render()
      }
    }
  } catch (err) {
    fail(err, 'engine-create')
  }

  if (evenHubHostPresent()) {
    try {
      const hub = await waitForEvenAppBridge()
      configStorage = evenHubConfigStorage(hub)
      apiConfig = await loadApiConfig(configStorage)
      if (backendKind !== 'webgpu' && !skipModelLoad) {
        applyApiConfig(apiConfig)
      }
      mountPhoneSettings(ui.settingsRoot, configStorage, (cfg) => {
        applyApiConfig(cfg)
      })

      const CID = 1
      const CNAME = 'chat'

      hubPaint = () => {
        void hub.textContainerUpgrade(
          new TextContainerUpgrade({
            containerID: CID,
            containerName: CNAME,
            contentOffset: 0,
            content: formatHubText(display()),
          }),
        )
      }

      await hub.createStartUpPageContainer(
        new CreateStartUpPageContainer({
          containerTotalNum: 1,
          textObject: [
            new TextContainerProperty({
              xPosition: 0,
              yPosition: 0,
              width: 576,
              height: 288,
              borderWidth: 0,
              borderColor: 5,
              paddingLength: 4,
              containerID: CID,
              containerName: CNAME,
              content: formatHubText(display()),
              isEventCapture: 1,
            }),
          ],
        }),
      )

      // Keep phone settings visible when opened from Even phone app; hide chrome for glasses paint focus.
      hub.onLaunchSource((source) => {
        if (source === 'glassesMenu') {
          ui.settingsRoot.style.display = 'none'
        } else {
          ui.settingsRoot.style.display = ''
        }
      })

      hubPaint()

      hub.onEvenHubEvent((event) => {
        handleEvenHubInput(event, {
          press: () => {
            if (mode === 'thinking') {
              cancelGeneration()
              return
            }
            if (mode === 'error') {
              location.reload()
              return
            }
            if (probeOnly || companionProbe) {
              void copyDiagnostics()
              return
            }
            if (canChat()) {
              void startGeneration(promptFromSelection())
              return
            }
            void copyDiagnostics()
          },
          doublePress: () => {
            if (mode === 'thinking') {
              cancelGeneration()
              return
            }
            if (probeOnly || companionProbe || !canChat()) {
              void copyDiagnostics()
              return
            }
            selectedPromptIndex = (selectedPromptIndex + 1) % PROMPTS.length
            render()
          },
          swipeUp: () => {
            if (mode === 'thinking') return
            if (probeOnly || companionProbe || !canChat()) return
            selectedPromptIndex = (selectedPromptIndex - 1 + PROMPTS.length) % PROMPTS.length
            render()
          },
          swipeDown: () => {
            if (mode === 'thinking') return
            if (probeOnly || companionProbe || !canChat()) return
            selectedPromptIndex = (selectedPromptIndex + 1) % PROMPTS.length
            render()
          },
        })
      })
    } catch (err) {
      fail(err, 'evenhub')
    }
  }

  window.addEventListener('beforeunload', async () => {
    try {
      await engine?.delete()
    } catch {
      // ignore
    }
  })
}

void main()
