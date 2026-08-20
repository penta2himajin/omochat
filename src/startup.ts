export type StartupOptions = {
  probeOnly: boolean
  /** Diagnostic mode: skip chat setup and focus on probe output. */
  companionProbe: boolean
  /** When true, fetch omoserv /hello at startup. */
  shouldProbeCompanion: boolean
  /** When true, skip loading API config / enabling chat. */
  skipModelLoad: boolean
}

/**
 * Resolve startup flags from URL query.
 *
 * - omoserv is probed by default (disable with companionProbe=0).
 * - Diagnostic skip-chat mode only with ?companionProbe=1 or ?probeOnly=1.
 */
export function resolveStartupOptions(search: string, _evenHub: boolean): StartupOptions {
  const params = new URLSearchParams(search)
  const probeOnly = params.get('probeOnly') === '1'
  const companionParam = params.get('companionProbe')
  const companionDisabled = companionParam === '0'
  const companionExplicit = companionParam === '1'

  const shouldProbeCompanion = !companionDisabled
  const companionProbe = !companionDisabled && (companionExplicit || probeOnly)
  const skipModelLoad = probeOnly || companionProbe

  return {
    probeOnly,
    companionProbe,
    shouldProbeCompanion,
    skipModelLoad,
  }
}
