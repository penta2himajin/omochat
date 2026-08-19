export type StartupOptions = {
  probeOnly: boolean
  /** When true, skip model load and focus on diagnostics. */
  companionProbe: boolean
  /** When true, fetch the companion /hello endpoint at startup. */
  shouldProbeCompanion: boolean
  skipModelLoad: boolean
}

/**
 * Resolve startup flags from URL query and host environment.
 *
 * - Companion is probed by default on Even Hub (no query param needed).
 * - Pass companionProbe=0 to disable companion fetch on desktop dev.
 */
export function resolveStartupOptions(search: string, evenHub: boolean): StartupOptions {
  const params = new URLSearchParams(search)
  const probeOnly = params.get('probeOnly') === '1'
  const companionParam = params.get('companionProbe')
  const companionDisabled = companionParam === '0'
  const companionExplicit = companionParam === '1'

  const shouldProbeCompanion = !companionDisabled
  const companionProbe = !companionDisabled && (companionExplicit || probeOnly || evenHub)
  const skipModelLoad = probeOnly || companionProbe

  return {
    probeOnly,
    companionProbe,
    shouldProbeCompanion,
    skipModelLoad,
  }
}
