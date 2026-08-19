export type WebGpuStatus = {
  api: boolean
  adapter: string | null
  detail: string
}

const ADAPTER_STRATEGIES: Array<{ label: string; opts: GPURequestAdapterOptions }> = [
  { label: 'high-performance', opts: { powerPreference: 'high-performance' } },
  { label: 'low-power', opts: { powerPreference: 'low-power' } },
  { label: 'fallback', opts: { forceFallbackAdapter: true } },
  { label: 'default', opts: {} },
]

const DESIRED_FEATURES = ['shader-f16', 'subgroups'] as GPUFeatureName[]

export async function probeWebGpu(): Promise<WebGpuStatus> {
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return { api: false, adapter: null, detail: 'navigator.gpu missing' }
  }

  for (const { label, opts } of ADAPTER_STRATEGIES) {
    const adapter = await navigator.gpu.requestAdapter(opts)
    if (adapter) {
      return { api: true, adapter: label, detail: `adapter ok (${label})` }
    }
  }

  return {
    api: true,
    adapter: null,
    detail: 'requestAdapter null (high-perf, low-power, fallback, default)',
  }
}

/** Pre-init WebGPU device on LiteRT-LM wasm before Engine.create. Returns strategy used. */
export async function installWebGpuDevice(liteRtLmWasm: { preinitializedWebGPUDevice?: GPUDevice }): Promise<string> {
  if (liteRtLmWasm.preinitializedWebGPUDevice) return 'cached'

  if (!navigator.gpu) throw new Error('navigator.gpu missing')

  const errors: string[] = []
  for (const { label, opts } of ADAPTER_STRATEGIES) {
    try {
      const adapter = await navigator.gpu.requestAdapter(opts)
      if (!adapter) {
        errors.push(`${label}: null`)
        continue
      }

      const requiredFeatures: GPUFeatureName[] = []
      for (const feature of DESIRED_FEATURES) {
        if (adapter.features.has(feature)) requiredFeatures.push(feature)
      }

      const requiredLimits: GPUDeviceDescriptor['requiredLimits'] = {
        maxBufferSize: adapter.limits.maxBufferSize,
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxStorageBuffersPerShaderStage: adapter.limits.maxStorageBuffersPerShaderStage,
        maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
      }

      const device = await adapter.requestDevice({ requiredFeatures, requiredLimits })
      liteRtLmWasm.preinitializedWebGPUDevice = device
      return label
    } catch (err) {
      errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  throw new Error(`No GPU adapter found. ${errors.join('; ')}`)
}
