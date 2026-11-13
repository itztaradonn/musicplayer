// Client for the import server (server/). The server URL and access token are kept in
// this browser's localStorage so nothing secret is baked into the public bundle.

const URL_KEY = 'mp_server_url'
const TOKEN_KEY = 'mp_server_token'

function read(key) {
  try { return localStorage.getItem(key) || '' } catch { return '' }
}
function write(key, value) {
  try { localStorage.setItem(key, value) } catch { /* private mode: setting just won't persist */ }
}

export function getServerConfig() {
  return {
    // Saved address, else VITE_IMPORT_API_URL, else the address the site itself is served from
    // (the one-service setup, where the same server hosts the site and the API).
    url: (read(URL_KEY) || import.meta.env.VITE_IMPORT_API_URL || window.location.origin).replace(/\/+$/, ''),
    token: read(TOKEN_KEY),
  }
}

export function saveServerConfig({ url, token }) {
  write(URL_KEY, url.trim().replace(/\/+$/, ''))
  write(TOKEN_KEY, token.trim())
}

export const isServerConfigured = () => {
  const { url, token } = getServerConfig()
  return Boolean(url && token)
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const { url, token } = getServerConfig()
  if (!url || !token) throw new Error('Set up the import server first.')
  let res
  try {
    res = await fetch(`${url}${path}`, {
      method,
      signal,
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new Error("Can't reach the import server. Check its address and that it is running.")
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = new Error(data.error || `Server error (${res.status})`)
    error.status = res.status
    throw error
  }
  return data
}

export const startImport = (url, autoLyrics) => request('/api/import', { method: 'POST', body: { url, autoLyrics } })
export const startLyricsGeneration = (trackId) => request(`/api/tracks/${trackId}/generate-lyrics`, { method: 'POST', body: {} })
export const saveLyrics = async (trackId, lyrics) => (await request(`/api/tracks/${trackId}/lyrics`, { method: 'PUT', body: { lyrics } })).track

/**
 * Polls a job until it finishes. Calls onUpdate with every snapshot and resolves with
 * the final job (or throws its error). Survives a few dropped requests in a row.
 */
export async function pollJob(jobId, { onUpdate, signal, intervalMs = 1500 } = {}) {
  let failures = 0
  for (;;) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      const job = await request(`/api/jobs/${jobId}`, { signal })
      failures = 0
      onUpdate?.(job)
      if (job.status === 'done') return job
      if (job.status === 'error') throw new Error(job.error || 'Something went wrong.')
    } catch (err) {
      if (err.name === 'AbortError' || err.status === 404 || err.status === 401 || !/reach the import server/.test(err.message)) throw err
      if (++failures >= 6) throw err
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}
