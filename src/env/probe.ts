import { probeWebGpuAvailability, type WebGpuAvailability } from '../webgpu.ts'

export type EnvProbeResult = {
  origin: string
  protocol: string
  secureContext: boolean
  crossOriginIsolated: boolean
  uaFull: string
  uad: string | null
  webgl2: boolean
  webglRenderer: string | null
  webgpu: WebGpuAvailability
}

async function probeUserAgentData(): Promise<string | null> {
  const nav = navigator as Navigator & {
    userAgentData?: {
      getHighEntropyValues: (hints: string[]) => Promise<{
        fullVersionList?: Array<{ brand: string; version: string }>
        platformVersion?: string
        architecture?: string
      }>
    }
  }

  if (!nav.userAgentData?.getHighEntropyValues) return null

  try {
    const values = await nav.userAgentData.getHighEntropyValues([
      'fullVersionList',
      'platformVersion',
      'architecture',
    ])
    const parts: string[] = []
    if (values.fullVersionList?.length) {
      parts.push(
        values.fullVersionList.map((e) => `${e.brand}/${e.version}`).join(', '),
      )
    }
    if (values.platformVersion) parts.push(`platform=${values.platformVersion}`)
    if (values.architecture) parts.push(`arch=${values.architecture}`)
    return parts.length > 0 ? parts.join('; ') : null
  } catch {
    return null
  }
}

function probeWebGl2(): { webgl2: boolean; renderer: string | null } {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    if (!gl) return { webgl2: false, renderer: null }

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
    if (!debugInfo) return { webgl2: true, renderer: '(debug ext unavailable)' }

    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    return {
      webgl2: true,
      renderer: typeof renderer === 'string' ? renderer : String(renderer),
    }
  } catch {
    return { webgl2: false, renderer: null }
  }
}

/** Run all environment probes once at startup. */
export async function runEnvProbe(): Promise<EnvProbeResult> {
  const webgpu = await probeWebGpuAvailability()
  const webgl = probeWebGl2()
  const uad = await probeUserAgentData()

  return {
    origin: typeof window !== 'undefined' ? window.location.origin : '',
    protocol: typeof window !== 'undefined' ? window.location.protocol : '',
    secureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
    crossOriginIsolated:
      typeof window !== 'undefined' && (window as Window & { crossOriginIsolated?: boolean }).crossOriginIsolated === true,
    uaFull: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    uad,
    webgl2: webgl.webgl2,
    webglRenderer: webgl.renderer,
    webgpu,
  }
}

export function formatEnvProbeText(probe: EnvProbeResult): string {
  const lines: string[] = []
  lines.push(`origin: ${probe.origin}`)
  lines.push(`proto: ${probe.protocol}`)
  lines.push(`secure: ${probe.secureContext ? 'yes' : 'no'}`)
  lines.push(`coi: ${probe.crossOriginIsolated ? 'yes' : 'no'}`)
  lines.push(`ua-full: ${probe.uaFull}`)
  lines.push(`uad: ${probe.uad ?? '(unavailable)'}`)
  lines.push(`webgl2: ${probe.webgl2 ? 'yes' : 'no'}`)
  lines.push(`webgl-renderer: ${probe.webglRenderer ?? 'none'}`)
  lines.push(`webgpu: ${probe.webgpu.status}`)
  if (probe.webgpu.reason) lines.push(`webgpu-reason: ${probe.webgpu.reason}`)
  if (probe.webgpu.adapterStrategy) lines.push(`webgpu-strategy: ${probe.webgpu.adapterStrategy}`)
  if (probe.webgpu.adapterInfo) lines.push(`webgpu-info: ${probe.webgpu.adapterInfo}`)
  if (probe.webgpu.adapterFeatures) lines.push(`webgpu-features: ${probe.webgpu.adapterFeatures}`)
  if (probe.webgpu.detail) lines.push(`webgpu-detail: ${probe.webgpu.detail}`)
  return lines.join('\n')
}

export async function copyEnvProbe(probe: EnvProbeResult): Promise<boolean> {
  if (!navigator.clipboard?.writeText) return false
  try {
    await navigator.clipboard.writeText(formatEnvProbeText(probe))
    return true
  } catch {
    return false
  }
}
