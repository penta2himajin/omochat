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
import { formatThrownError, type AppError } from './errors.ts'
import { installWebGpuDevice, probeWebGpu, type WebGpuStatus } from './webgpu.ts'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const MODEL_URL_GEMMA4_E4B =
  'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.litertlm'

// WebGPUが無い環境でも動かせるportable build。
const MODEL_URL_QWEN3_0_6B_CPU =
  'https://huggingface.co/litert-community/Qwen3-0.6B/resolve/main/Qwen3-0.6B.litertlm'

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
  // Qwen3系は <think> ... </think> を返すことがある。
  // 表示は「答え部分のみ」にするため、思考ブロックを落とす。
  const start = text.indexOf('<think>')
  if (start < 0) return text.trim()
  const end = text.indexOf('</think>', start)
  if (end < 0) return text.slice(0, start).trim()
  // '</think>' の長さは 8。
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
  onStep: (step: LoadingStep) => void,
  webGpu: WebGpuStatus,
  backendOverride?: number,
): Promise<LmBundle> {
  onStep('webgpu')
  const backend = backendOverride ?? (webGpu.adapter ? Backend.GPU_ARTISAN : Backend.CPU)
  const wantWebGpu = backend === Backend.GPU_ARTISAN

  onStep('cdn-import')
  try {
    await loadLiteRtLm(LITERT_LM_WASM_PATH)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // リトライ時に LiteRT-LM が既にロード済みの場合がある。
    if (msg.includes('already loading') || msg.includes('already loaded')) {
      // ignore
    } else {
      throw Object.assign(formatThrownError(err, 'cdn-import'), { phase: 'cdn-import' })
    }
  }

  onStep('engine-create')
  if (wantWebGpu) {
    try {
      const wasm = getGlobalLiteRtLm().liteRtLmWasm
      const strategy = await installWebGpuDevice(wasm)
      webGpu.adapter = strategy
      webGpu.detail = `device via ${strategy}`
    } catch (err) {
      // GPU戦略を捨てる: ここで落ちてもCPU側で動く可能性がある。
      // （ただしGemma4 web buildsはCPU不可なので、この場合は結局失敗する）
      throw Object.assign(formatThrownError(err, 'webgpu'), { phase: 'webgpu' })
    }
  }

  let engine: LmBundle['engine']
  try {
    engine = await Engine.create({
      model: modelUrl,
      backend,
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

  controls.appendChild(input)
  controls.appendChild(sendBtn)

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendBtn.click()
    }
  })

  root.appendChild(status)
  root.appendChild(chat)
  root.appendChild(controls)

  return {
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
  webGpu: WebGpuStatus
  error?: AppError
  backendLabel: string
  secureContext: boolean
  crossOriginIsolated: boolean
  protocol: string
  userAgent: string
}): DisplayState {
  return {
    mode: args.mode,
    selectedPromptIndex: args.selectedPromptIndex,
    promptCount: PROMPTS.length,
    messages: args.messages,
    streamingTail: args.streamingTail,
    loadingStep: args.loadingStep,
    webGpu: args.webGpu.api,
    webGpuAdapter: args.webGpu.adapter,
    webGpuDetail: args.webGpu.detail,
    secureContext: args.secureContext,
    crossOriginIsolated: args.crossOriginIsolated,
    protocol: args.protocol,
    userAgent: args.userAgent,
    modelLabel: modelLabelFromUrl(args.modelUrl),
    error: args.error,
    backendLabel: args.backendLabel,
  }
}

async function main() {
  const root = document.querySelector('#app')! as HTMLElement
  const ui = mountWebUi(root)

  const userModelUrl = import.meta.env.VITE_MODEL_URL || MODEL_URL_GEMMA4_E4B

  // When opening with `?probeOnly=1`, skip model downloads and only probe WebGPU/origin isolation.
  const probeOnly = new URLSearchParams(window.location.search).get('probeOnly') === '1'

  const env = {
    secureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
    crossOriginIsolated: typeof window !== 'undefined' && (window as any).crossOriginIsolated === true,
    protocol: typeof window !== 'undefined' ? window.location.protocol : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  }

  let mode: Mode = 'loading'
  let loadingStep: LoadingStep | undefined = 'webgpu'
  let selectedPromptIndex = 0
  let messages: ChatMessage[] = []
  let streamingTail = ''
  let error: AppError | undefined

  let engine: LmBundle['engine'] | null = null
  let conversation: LmBundle['conversation'] | null = null

  let hubPaint: (() => void) | null = null
  let webGpuStatus: WebGpuStatus = { api: false, adapter: null, detail: 'not probed' }
  let activeModelUrl = userModelUrl
  let backendLabel = 'webgpu'

  const display = (): DisplayState =>
    toDisplayState({
      mode,
      selectedPromptIndex,
      messages,
      streamingTail,
      loadingStep,
      modelUrl: activeModelUrl,
      webGpu: webGpuStatus,
      error,
      backendLabel,
      secureContext: env.secureContext,
      crossOriginIsolated: env.crossOriginIsolated,
      protocol: env.protocol,
      userAgent: env.userAgent.slice(0, 60),
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

  const startGeneration = async (prompt: string) => {
    if (!conversation || mode === 'thinking') return

    mode = 'thinking'
    streamingTail = ''
    error = undefined
    render()

    messages = [...messages, { role: 'user', content: prompt }]
    let assistantDraft = ''
    let lastUiRenderTs = performance.now()

    try {
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

  render()

  try {
    mode = 'loading'
    loadingStep = 'webgpu'
    error = undefined
    webGpuStatus = await probeWebGpu()

    if (!webGpuStatus.adapter) {
      backendLabel = 'cpu'
      activeModelUrl = MODEL_URL_QWEN3_0_6B_CPU
    } else {
      backendLabel = 'webgpu'
      activeModelUrl = userModelUrl
    }

    render()

    if (probeOnly) {
      loadingStep = 'done'
      mode = 'idle'
      activeModelUrl = '(probeOnly: model not loaded)'
      backendLabel = webGpuStatus.adapter ? 'webgpu(probeOnly)' : 'cpu(probeOnly)'
      render()
    } else {
      let created: Awaited<ReturnType<typeof createLmConversation>>
      try {
        created = await createLmConversation(
          activeModelUrl,
          (step) => {
            loadingStep = step
            render()
          },
          webGpuStatus,
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // GPU/streaming が未対応のモデルだった場合、Qwen3 を CPU で再試行。
        if (msg.includes('Streaming kTfLitePrefillDecode models is not supported yet')) {
          activeModelUrl = MODEL_URL_QWEN3_0_6B_CPU
          backendLabel = 'cpu'
          loadingStep = 'engine-create'
          render()
          created = await createLmConversation(
            activeModelUrl,
            (step) => {
              loadingStep = step
              render()
            },
            webGpuStatus,
            Backend.CPU,
          )
        } else {
          throw err
        }
      }
      engine = created.engine
      conversation = created.conversation
      loadingStep = 'done'
      mode = 'idle'
      render()
    }
  } catch (err) {
    fail(err, 'engine-create')
  }

  if (evenHubHostPresent()) {
    try {
      const hub = await waitForEvenAppBridge()
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

      root.style.display = 'none'
      hubPaint()

      hub.onEvenHubEvent((event) => {
        handleEvenHubInput(event, {
          press: () => {
            if (mode === 'thinking') {
              cancelGeneration()
              return
            }
            if (mode === 'error') {
              // Retry init on press when stuck in error.
              location.reload()
              return
            }
            void startGeneration(promptFromSelection())
          },
          doublePress: () => {
            if (mode === 'thinking') {
              cancelGeneration()
              return
            }
            selectedPromptIndex = (selectedPromptIndex + 1) % PROMPTS.length
            render()
          },
          swipeUp: () => {
            if (mode === 'thinking') return
            selectedPromptIndex = (selectedPromptIndex - 1 + PROMPTS.length) % PROMPTS.length
            render()
          },
          swipeDown: () => {
            if (mode === 'thinking') return
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
