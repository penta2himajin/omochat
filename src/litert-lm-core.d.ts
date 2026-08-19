declare module '@litert-lm/core' {
  export const Backend: {
    UNSPECIFIED: number
    CPU_ARTISAN: number
    GPU_ARTISAN: number
    CPU: number
    GPU: number
    GOOGLE_TENSOR_ARTISAN: number
    NPU: number
  }

  export class Engine {
    static create(opts: { model: string; backend?: number; mainExecutorSettings?: unknown }): Promise<{
      createConversation: (cfg?: unknown) => Promise<{
        cancel?: () => void
        sendMessageStreaming: (prompt: string) => AsyncIterable<unknown>
      }>
      delete: () => Promise<void>
    }>
    delete(): Promise<void>
  }

  export function loadLiteRtLm(path: string, options?: unknown): Promise<unknown>

  export function getGlobalLiteRtLm(): {
    liteRtLmWasm: { preinitializedWebGPUDevice?: GPUDevice }
    setupDefaultWebGpuDevice(): Promise<void>
  }
}
