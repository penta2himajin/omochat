export type EnvProbeResult = {
  origin: string
  protocol: string
  secureContext: boolean
  crossOriginIsolated: boolean
  uaFull: string
  uad: string | null
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
      parts.push(values.fullVersionList.map((e) => `${e.brand}/${e.version}`).join(', '))
    }
    if (values.platformVersion) parts.push(`platform=${values.platformVersion}`)
    if (values.architecture) parts.push(`arch=${values.architecture}`)
    return parts.length > 0 ? parts.join('; ') : null
  } catch {
    return null
  }
}

/** Lightweight environment dump for diagnostics (no WebGPU). */
export async function runEnvProbe(): Promise<EnvProbeResult> {
  const uad = await probeUserAgentData()
  return {
    origin: typeof window !== 'undefined' ? window.location.origin : '',
    protocol: typeof window !== 'undefined' ? window.location.protocol : '',
    secureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
    crossOriginIsolated:
      typeof window !== 'undefined' &&
      (window as Window & { crossOriginIsolated?: boolean }).crossOriginIsolated === true,
    uaFull: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    uad,
  }
}

export function formatEnvProbeText(probe: EnvProbeResult): string {
  return [
    `origin: ${probe.origin}`,
    `proto: ${probe.protocol}`,
    `secure: ${probe.secureContext ? 'yes' : 'no'}`,
    `coi: ${probe.crossOriginIsolated ? 'yes' : 'no'}`,
    `ua-full: ${probe.uaFull}`,
    `uad: ${probe.uad ?? '(unavailable)'}`,
  ].join('\n')
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
