export type WebGpuUnsupportReason = 'no-api' | 'no-adapter' | 'no-device'

export type WebGpuAvailability = {
  status: 'supported' | 'unsupported'
  reason?: WebGpuUnsupportReason
  adapterStrategy?: string
  adapterInfo?: string
  adapterFeatures?: string
  detail: string
  /** Set when status is supported; reused by LiteRT-LM init. */
  device?: GPUDevice
}

const ADAPTER_STRATEGIES: Array<{ label: string; opts: GPURequestAdapterOptions }> = [
  { label: 'high-performance', opts: { powerPreference: 'high-performance' } },
  { label: 'low-power', opts: { powerPreference: 'low-power' } },
  { label: 'fallback', opts: { forceFallbackAdapter: true } },
  { label: 'default', opts: {} },
]

const DESIRED_FEATURES = ['shader-f16', 'subgroups'] as GPUFeatureName[]

function formatAdapterInfo(adapter: GPUAdapter): string {
  const info = adapter.info
  if (!info) return '(no adapter.info)'
  const parts = [info.vendor, info.architecture, info.device, info.description].filter(Boolean)
  return parts.length > 0 ? parts.join(' / ') : '(empty adapter.info)'
}

function formatAdapterFeatures(adapter: GPUAdapter): string {
  const features = [...adapter.features.values()]
  return features.length > 0 ? features.join(', ') : '(none)'
}

async function requestDeviceFromAdapter(adapter: GPUAdapter): Promise<GPUDevice> {
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

  return adapter.requestDevice({ requiredFeatures, requiredLimits })
}

/** Probe WebGPU end-to-end: requestAdapter + requestDevice. */
export async function probeWebGpuAvailability(): Promise<WebGpuAvailability> {
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return {
      status: 'unsupported',
      reason: 'no-api',
      detail: 'navigator.gpu missing',
    }
  }

  const adapterErrors: string[] = []
  for (const { label, opts } of ADAPTER_STRATEGIES) {
    const adapter = await navigator.gpu.requestAdapter(opts)
    if (!adapter) {
      adapterErrors.push(`${label}: null`)
      continue
    }

    try {
      const device = await requestDeviceFromAdapter(adapter)
      return {
        status: 'supported',
        adapterStrategy: label,
        adapterInfo: formatAdapterInfo(adapter),
        adapterFeatures: formatAdapterFeatures(adapter),
        detail: `adapter+device ok (${label})`,
        device,
      }
    } catch (err) {
      adapterErrors.push(`${label}: device ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const hadAdapter = adapterErrors.some((e) => !e.includes(': null'))
  return {
    status: 'unsupported',
    reason: hadAdapter ? 'no-device' : 'no-adapter',
    detail: hadAdapter
      ? `requestDevice failed (${adapterErrors.join('; ')})`
      : 'requestAdapter null (high-perf, low-power, fallback, default)',
  }
}

/** Install probed device on LiteRT-LM wasm before Engine.create. */
export async function installWebGpuDevice(
  liteRtLmWasm: { preinitializedWebGPUDevice?: GPUDevice },
  availability: WebGpuAvailability,
): Promise<string> {
  if (liteRtLmWasm.preinitializedWebGPUDevice) return 'cached'
  if (availability.status !== 'supported' || !availability.device) {
    throw new Error(availability.detail || 'WebGPU unsupported')
  }
  liteRtLmWasm.preinitializedWebGPUDevice = availability.device
  return availability.adapterStrategy ?? 'probed'
}
