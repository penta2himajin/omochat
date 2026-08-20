import { describe, expect, it } from 'vitest'
import { resolveStartupOptions } from './startup.ts'

describe('resolveStartupOptions', () => {
  it('probes omoserv on Even Hub without forcing diagnostic skip', () => {
    const opts = resolveStartupOptions('', true)
    expect(opts.shouldProbeCompanion).toBe(true)
    expect(opts.companionProbe).toBe(false)
    expect(opts.skipModelLoad).toBe(false)
  })

  it('probes omoserv on desktop by default but does not skip model load', () => {
    const opts = resolveStartupOptions('', false)
    expect(opts.shouldProbeCompanion).toBe(true)
    expect(opts.companionProbe).toBe(false)
    expect(opts.skipModelLoad).toBe(false)
  })

  it('honours companionProbe=0 to disable omoserv fetch', () => {
    const opts = resolveStartupOptions('?companionProbe=0', true)
    expect(opts.shouldProbeCompanion).toBe(false)
    expect(opts.companionProbe).toBe(false)
  })

  it('honours companionProbe=1 for diagnostic mode', () => {
    const opts = resolveStartupOptions('?companionProbe=1', false)
    expect(opts.shouldProbeCompanion).toBe(true)
    expect(opts.companionProbe).toBe(true)
    expect(opts.skipModelLoad).toBe(true)
  })
})
