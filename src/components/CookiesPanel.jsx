import { useEffect, useState } from 'react'
import { ArrowLeft, Cookie, Loader, ShieldAlert, Trash2, TriangleAlert } from 'lucide-react'
import { deleteCookies, getCookiesStatus, isServerConfigured, saveCookies } from '../lib/api'
import ServerSettings from './ServerSettings'

const formatDate = (iso) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

/** Lets you give the server your YouTube cookies so YouTube stops blocking downloads ("confirm you're not a bot"). */
export default function CookiesPanel({ onBack }) {
  const [configured, setConfigured] = useState(isServerConfigured())
  const [status, setStatus] = useState(null) // null while loading
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(null)

  useEffect(() => {
    if (!configured) return
    let alive = true
    getCookiesStatus()
      .then((s) => alive && setStatus(s))
      .catch((err) => alive && setError(err.message))
    return () => { alive = false }
  }, [configured])

  const save = async () => {
    setBusy(true); setError(''); setSaved(null)
    try {
      const result = await saveCookies(text)
      setStatus(result)
      setSaved(result)
      setText('') // don't keep the secret sitting in the page
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!window.confirm('Remove the saved YouTube cookies from the server?')) return
    setBusy(true); setError(''); setSaved(null)
    try {
      await deleteCookies()
      setStatus({ configured: false })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const loadFile = async (e) => {
    const file = e.target.files?.[0]
    if (file) setText(await file.text())
    e.target.value = ''
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors">
        <ArrowLeft size={16} /> Back
      </button>

      <p className="text-sm text-white/70">
        If YouTube blocks the server with <em>"Sign in to confirm you're not a bot"</em>, give it your YouTube cookies. They make downloads look like you, signed in.
      </p>

      <div className="flex gap-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-100 text-xs p-3">
        <ShieldAlert size={16} className="shrink-0 mt-0.5" />
        <span>
          Cookies work like a password to your Google account. They're stored only on your server, never in the website or database. Only YouTube and Google cookies are kept, and everything else you paste is thrown away. A spare Google account is safer than your main one.
        </span>
      </div>

      {!configured ? (
        <div className="space-y-2">
          <p className="text-sm text-white/60">Connect your server first.</p>
          <ServerSettings onSaved={() => setConfigured(true)} />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2.5 text-sm">
            <span className="flex items-center gap-2 min-w-0 text-white/80">
              {status === null && !error ? <Loader size={15} className="animate-spin" /> : <Cookie size={15} className={status?.configured ? 'text-emerald-400' : 'text-white/40'} />}
              <span className="leading-snug">
                {status === null && !error && 'Checking…'}
                {status?.configured && `${status.count} cookies saved${status.earliestExpiry ? ` · soonest expiry ${formatDate(status.earliestExpiry)}` : ''}`}
                {status && !status.configured && (status.problem || 'No cookies saved')}
              </span>
            </span>
            {status?.configured && (
              <button onClick={remove} disabled={busy} aria-label="Remove saved cookies" className="p-1.5 rounded-lg text-white/50 hover:text-red-300 hover:bg-red-400/10 transition-colors">
                <Trash2 size={15} />
              </button>
            )}
          </div>

          <details className="text-sm text-white/70 rounded-xl bg-white/5 px-3 py-2.5">
            <summary className="cursor-pointer font-semibold text-white/80">How to get your cookies</summary>
            <ol className="mt-2 ml-4 list-decimal space-y-1.5 text-white/60">
              <li>In your computer's browser, open a <strong>private / incognito window</strong> and sign in to YouTube. This stops YouTube from replacing the cookies right after you copy them.</li>
              <li>In that same tab, go to <code className="text-white/80">youtube.com/robots.txt</code>.</li>
              <li>With a cookie export extension (for example "Get cookies.txt LOCALLY"), export cookies for <strong>youtube.com</strong> in <em>Netscape</em> format and copy the text.</li>
              <li>Close the private window so the cookies are never used again there, then paste the text below.</li>
            </ol>
            <p className="mt-2 text-xs text-white/40">You can also paste a <code>Cookie:</code> header copied from your browser's network tab. The cookies.txt export is more reliable.</p>
          </details>

          <textarea
            value={text} onChange={(e) => setText(e.target.value)} rows={7}
            placeholder="Paste cookies.txt contents here…"
            spellCheck={false} autoComplete="off" autoCapitalize="none" autoCorrect="off"
            className="w-full rounded-xl bg-white/10 border border-white/10 focus:border-accent/60 outline-none p-3 text-xs text-white placeholder:text-white/30 font-mono leading-relaxed resize-y"
          />
          <div className="flex items-center justify-between text-xs text-white/40 -mt-2">
            <span>cookies.txt or a Cookie header</span>
            <label className="cursor-pointer hover:text-white/70 transition-colors">
              Load from file
              <input type="file" accept=".txt,text/plain" className="hidden" onChange={loadFile} />
            </label>
          </div>

          {error && (
            <p role="alert" className="flex gap-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-sm p-3">
              <TriangleAlert size={16} className="shrink-0 mt-0.5" /><span>{error}</span>
            </p>
          )}
          {saved && (
            <div className="space-y-1 text-sm">
              <p className="text-emerald-300">Saved {saved.count} cookies.{saved.dropped > 0 && ` Discarded ${saved.dropped} from other sites.`} Try your import again.</p>
              {!saved.loggedIn && (
                <p className="flex gap-2 text-amber-200"><TriangleAlert size={16} className="shrink-0 mt-0.5" /><span>These don't look like signed-in cookies (no SID or LOGIN_INFO). If imports still fail, sign in and export again.</span></p>
              )}
            </div>
          )}

          <button
            onClick={save} disabled={busy || !text.trim()}
            className="w-full rounded-xl bg-accent hover:brightness-110 disabled:bg-white/10 disabled:text-white/30 text-white font-semibold py-3 transition-all"
          >
            {busy ? 'Saving…' : 'Save cookies'}
          </button>
        </>
      )}
    </div>
  )
}
