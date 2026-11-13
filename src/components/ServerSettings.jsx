import { useState } from 'react'
import { getServerConfig, saveServerConfig } from '../lib/api'

const field = 'w-full rounded-xl bg-white/10 border border-white/10 focus:border-accent/60 outline-none px-3 py-2.5 text-sm text-white placeholder:text-white/30'

/** Where the import server lives and the secret token that unlocks it. Stored on this device only. */
export default function ServerSettings({ onSaved }) {
  const initial = getServerConfig()
  const [url, setUrl] = useState(initial.url)
  const [token, setToken] = useState(initial.token)

  const submit = (e) => {
    e.preventDefault()
    saveServerConfig({ url, token })
    onSaved?.()
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="text-xs font-semibold text-white/60">Server address</span>
        <input className={`${field} mt-1`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-server.up.railway.app" inputMode="url" autoCapitalize="none" autoCorrect="off" required />
      </label>
      <label className="block">
        <span className="text-xs font-semibold text-white/60">Access token (API_TOKEN from the server)</span>
        <input className={`${field} mt-1`} value={token} onChange={(e) => setToken(e.target.value)} type="password" autoComplete="off" required />
      </label>
      <button type="submit" className="w-full rounded-xl bg-white/15 hover:bg-white/25 text-white text-sm font-semibold py-2.5 transition-colors">
        Save server settings
      </button>
    </form>
  )
}
