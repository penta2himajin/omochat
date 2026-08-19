export const COMPANION_ORIGIN = 'http://127.0.0.1:8765'

export type CompanionProbeResult = {
  status: 'ok' | 'fail' | 'skip'
  url: string
  body?: string
  detail: string
}

export async function probeCompanion(baseUrl = COMPANION_ORIGIN): Promise<CompanionProbeResult> {
  const url = `${baseUrl}/hello`
  try {
    const res = await fetch(url, { method: 'GET' })
    const body = await res.text()
    if (res.ok) {
      return {
        status: 'ok',
        url,
        body: body.trim(),
        detail: `HTTP ${res.status}`,
      }
    }
    return {
      status: 'fail',
      url,
      body: body.trim(),
      detail: `HTTP ${res.status}`,
    }
  } catch (err) {
    return {
      status: 'fail',
      url,
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}
