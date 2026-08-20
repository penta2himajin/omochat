import './style.css'
import {
  CreateStartUpPageContainer,
  OsEventTypeList,
  TextContainerProperty,
  TextContainerUpgrade,
  waitForEvenAppBridge,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk'
import {
  buildMenuItems,
  clamp,
  formatHubText,
  GLASSES_BORDER_WIDTH,
  GLASSES_CANVAS_HEIGHT,
  GLASSES_CANVAS_WIDTH,
  GLASSES_PADDING_LENGTH,
  type DisplayState,
  type LoadingStep,
  type Mode,
  type ViewMode,
} from './display.ts'
import { applyHistoryPageDelta, applyViewModeToggle, fullTextUpgradePayload } from './viewMode.ts'
import { copyEnvProbe, runEnvProbe, type EnvProbeResult } from './env/probe.ts'
import { probeCompanion, type CompanionProbeResult } from './companion/probe.ts'
import { formatThrownError, type AppError } from './errors.ts'
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

const DEFAULT_MODEL = 'gemma-4-e2b'
const SYSTEM_PROMPT =
  'You are a helpful assistant. Answer in Japanese. Keep responses short and useful for a wearable display.'

const PROMPTS = [
  'こんにちは。短く自己紹介して。',
  '今日の気分転換にいいことを、短く3つ教えて。',
]

const MENU_ITEMS = buildMenuItems(PROMPTS)

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
  }
}

async function main() {
  const root = document.querySelector('#app')! as HTMLElement
  const ui = mountWebUi(root)

  const evenHub = evenHubHostPresent()
  const { probeOnly, companionProbe, shouldProbeCompanion, skipModelLoad } = resolveStartupOptions(
    window.location.search,
    evenHub,
  )

  let mode: Mode = 'loading'
  let viewMode: ViewMode = 'selection'
  let loadingStep: LoadingStep | undefined = 'env-probe'
  let selectedMenuIndex = 0
  let historyPageIndex = 0
  let messages: ChatMessage[] = []
  let streamingTail = ''
  let notice: string | undefined
  let error: AppError | undefined

  let openaiClient: OpenAiClient | null = null
  let preferredModel = DEFAULT_MODEL
  let modelLabel = '(omoserv: configure API in phone settings)'
  let chatReady = false

  let hubPaint: (() => void) | null = null
  let configStorage: ConfigStorage = browserConfigStorage()
  let envProbe: EnvProbeResult = {
    origin: '',
    protocol: '',
    secureContext: false,
    crossOriginIsolated: false,
    uaFull: '',
    uad: null,
  }
  let companionResult: CompanionProbeResult = {
    status: 'skip',
    url: '',
    detail: 'not probed',
  }

  const display = (): DisplayState => ({
    mode,
    viewMode,
    selectedMenuIndex,
    menuItems: MENU_ITEMS,
    messages,
    historyPageIndex,
    streamingTail,
    loadingStep,
    env: envProbe,
    companion: companionResult,
    modelLabel,
    chatReady,
    probeOnly,
    companionProbe,
    notice,
    error,
  })

  const render = () => {
    try {
      const text = formatHubText(display())
      ui.setChatText(text)
      ui.setStatus(
        mode === 'loading'
          ? `loading (${loadingStep ?? '…'})`
          : mode === 'idle'
            ? viewMode === 'history'
              ? 'history'
              : 'idle'
            : mode === 'thinking'
              ? 'generating…'
              : error
                ? `error @ ${error.phase}: ${error.message}`
                : mode,
      )
      hubPaint?.()
    } catch (err) {
      console.error('[omochat] render failed', err)
    }
  }

  const viewToggleState = () => ({
    mode,
    viewMode,
    chatReady,
    probeOnly,
    companionProbe,
    messages,
    historyPageIndex,
  })

  const fail = (err: unknown, phase: AppError['phase']) => {
    error =
      err && typeof err === 'object' && 'phase' in err && 'message' in err
        ? (err as AppError)
        : formatThrownError(err, phase)
    mode = 'error'
    viewMode = 'selection'
    loadingStep = undefined
    streamingTail = ''
    render()
    console.error('[omochat]', error)
  }

  const copyDiagnostics = async () => {
    const ok = await copyEnvProbe(envProbe)
    ui.setStatus(ok ? 'diagnostics copied' : 'copy failed')
  }

  const applyApiConfig = async (config: OmochatApiConfig | null) => {
    if (!isApiConfigComplete(config)) {
      openaiClient = null
      chatReady = false
      preferredModel = DEFAULT_MODEL
      modelLabel = '(omoserv: configure API in phone settings)'
      render()
      return
    }

    const client = createOpenAiClient(config)
    openaiClient = client
    chatReady = true
    modelLabel = `omoserv · ${preferredModel}`

    try {
      const health = await client.getHealth()
      preferredModel = (await client.listModels())[0]?.id ?? DEFAULT_MODEL
      const bits = [`omoserv · ${preferredModel}`]
      if (!health.model_ready) bits.push('model not downloaded')
      else if (!health.llm_ready) bits.push('tap Load model in omoserv')
      else bits.push(`ready/${health.backend}`)
      modelLabel = bits.join(' · ')
      if (mode === 'error' && error?.phase === 'companion') {
        error = undefined
        mode = 'idle'
      }
    } catch {
      modelLabel = `omoserv · ${preferredModel}`
    }
    render()
  }

  const startGeneration = async (prompt: string) => {
    if (mode === 'thinking') return
    if (!openaiClient) return

    viewMode = 'selection'
    mode = 'thinking'
    notice = undefined
    streamingTail = ''
    error = undefined
    render()

    messages = [...messages, { role: 'user', content: prompt }]
    let assistantDraft = ''
    let lastUiRenderTs = performance.now()

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }))
      const stream = openaiClient.streamChatCompletion({
        model: preferredModel,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
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
    render()
  }

  const activateSelection = () => {
    const item = MENU_ITEMS[selectedMenuIndex]
    if (!item) return
    if (item.kind === 'mic') {
      notice = 'mic input not implemented'
      render()
      return
    }
    notice = undefined
    void startGeneration(item.label)
  }

  const toggleViewMode = () => {
    const next = applyViewModeToggle(viewToggleState())
    if (!next) return
    viewMode = next.viewMode
    historyPageIndex = next.historyPageIndex
    notice = undefined
    render()
  }

  const moveMenu = (delta: number) => {
    if (mode !== 'idle' || viewMode !== 'selection') return
    selectedMenuIndex = clamp(selectedMenuIndex + delta, 0, MENU_ITEMS.length - 1)
    notice = undefined
    render()
  }

  const moveHistoryPage = (delta: number) => {
    const next = applyHistoryPageDelta(viewToggleState(), delta)
    if (!next) return
    historyPageIndex = next.historyPageIndex
    render()
  }

  ui.onSend(() => {
    const q = ui.getInput()
    if (q) void startGeneration(q)
  })
  ui.onCopyDiagnostics(() => {
    void copyDiagnostics()
  })

  render()

  mountPhoneSettings(ui.settingsRoot, configStorage, (cfg) => {
    void applyApiConfig(cfg)
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
      modelLabel = companionProbe
        ? companionResult.status === 'ok'
          ? '(companionProbe: ok)'
          : '(companionProbe: failed)'
        : '(probeOnly: chat skipped)'
      chatReady = false
      loadingStep = 'done'
      mode = companionProbe && companionResult.status === 'fail' ? 'error' : 'idle'
      if (mode === 'error') {
        error = formatThrownError(
          new Error(`omoserv unreachable: ${companionResult.detail}`),
          'companion',
        )
      }
      render()
    } else {
      loadingStep = 'api-config'
      render()
      const cfg = await loadApiConfig(configStorage)
      await applyApiConfig(cfg)
      loadingStep = 'done'
      mode = 'idle'
      render()
    }
  } catch (err) {
    fail(err, 'unknown')
  }

  if (evenHubHostPresent()) {
    try {
      const hub = await waitForEvenAppBridge()
      configStorage = evenHubConfigStorage(hub)
      if (!skipModelLoad) {
        await applyApiConfig(await loadApiConfig(configStorage))
      }
      mountPhoneSettings(ui.settingsRoot, configStorage, (cfg) => {
        void applyApiConfig(cfg)
      })

      const CID = 1
      const CNAME = 'chat'

      hubPaint = () => {
        const content = formatHubText(display())
        void hub.textContainerUpgrade(
          new TextContainerUpgrade(fullTextUpgradePayload(CID, CNAME, content)),
        )
      }

      await hub.createStartUpPageContainer(
        new CreateStartUpPageContainer({
          containerTotalNum: 1,
          textObject: [
            new TextContainerProperty({
              xPosition: 0,
              yPosition: 0,
              width: GLASSES_CANVAS_WIDTH,
              height: GLASSES_CANVAS_HEIGHT,
              borderWidth: GLASSES_BORDER_WIDTH,
              borderColor: 5,
              paddingLength: GLASSES_PADDING_LENGTH,
              containerID: CID,
              containerName: CNAME,
              content: formatHubText(display()),
              isEventCapture: 1,
            }),
          ],
        }),
      )

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
            // History mode: press is intentionally a no-op.
            if (viewMode === 'history') return
            if (chatReady) {
              activateSelection()
              return
            }
            void copyDiagnostics()
          },
          doublePress: () => {
            if (mode === 'thinking') {
              cancelGeneration()
              return
            }
            if (probeOnly || companionProbe) {
              void copyDiagnostics()
              return
            }
            toggleViewMode()
          },
          swipeUp: () => {
            if (mode === 'thinking') return
            if (viewMode === 'history') {
              // Older page
              moveHistoryPage(-1)
              return
            }
            moveMenu(-1)
          },
          swipeDown: () => {
            if (mode === 'thinking') return
            if (viewMode === 'history') {
              // Newer page
              moveHistoryPage(1)
              return
            }
            moveMenu(1)
          },
        })
      })
    } catch (err) {
      fail(err, 'evenhub')
    }
  }
}

void main()
