import { useState } from 'react'
import { Check, Cookie, Link as LinkIcon, Loader, Settings, TriangleAlert } from 'lucide-react'
import { withUrls } from '../db'
import { isServerConfigured } from '../lib/api'
import Artwork from './Artwork'
import CookiesPanel from './CookiesPanel'
import ServerSettings from './ServerSettings'
import Sheet from './Sheet'

const ORDER = ['queued', 'downloading', 'saving', 'transcribing', 'done']

function steps(autoLyrics) {
  return [
    { key: 'downloading', label: 'Downloading audio from YouTube' },
    { key: 'saving', label: 'Saving to your library' },
    ...(autoLyrics ? [{ key: 'transcribing', label: 'Listening for lyrics' }] : []),
  ]
}

function Step({ label, state }) {
  return (
    <li className={`flex items-center gap-3 text-sm ${state === 'todo' ? 'text-white/35' : 'text-white'}`}>
      <span className="w-5 h-5 flex items-center justify-center">
        {state === 'done' && <Check size={18} className="text-emerald-400" />}
        {state === 'active' && <Loader size={16} className="animate-spin text-accent" />}
        {state === 'todo' && <span className="w-1.5 h-1.5 rounded-full bg-white/25" />}
      </span>
      {label}
    </li>
  )
}

export default function ImportModal({ job, onStart, onReset, onClose }) {
  const [url, setUrl] = useState('')
  const [autoLyrics, setAutoLyrics] = useState(true)
  const [configured, setConfigured] = useState(isServerConfigured())
  const [showSettings, setShowSettings] = useState(!isServerConfigured())
  const [view, setView] = useState('import') // 'import' | 'cookies'

  const running = job && (job.status === 'queued' || job.status === 'running')
  const finished = job?.status === 'done'
  const failed = job?.status === 'error'
  const stageIndex = job ? ORDER.indexOf(job.stage) : -1

  const submit = (e) => {
    e.preventDefault()
    if (!url.trim() || running) return
    onStart(url.trim(), autoLyrics)
  }

  return (
    <Sheet title={view === 'cookies' ? 'YouTube cookies' : 'Add from YouTube'} onClose={onClose}>
      {view === 'cookies' ? (
        <CookiesPanel onBack={() => setView('import')} />
      ) : (
      <>
      {showSettings && (
        <div className="mb-5 space-y-2">
          {!configured && <p className="text-sm text-white/60">Enter your access token once (the API_TOKEN you set on the server). It's saved on this device only.</p>}
          <ServerSettings onSaved={() => { setConfigured(true); setShowSettings(false) }} />
        </div>
      )}

      {!job || failed ? (
        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-center gap-2 rounded-xl bg-white/10 border border-white/10 focus-within:border-accent/60 px-3">
            <LinkIcon size={16} className="text-white/40 shrink-0" />
            <input
              value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a YouTube link" inputMode="url" autoCapitalize="none" autoCorrect="off" autoFocus
              className="flex-1 bg-transparent outline-none py-3 text-sm text-white placeholder:text-white/30"
            />
          </div>

          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span>
              <span className="block text-sm font-semibold text-white">Generate lyrics automatically</span>
              <span className="block text-xs text-white/50">Listens to the song and writes synced lyrics. You can edit them afterwards.</span>
            </span>
            <input type="checkbox" checked={autoLyrics} onChange={(e) => setAutoLyrics(e.target.checked)} className="w-5 h-5 accent-[#fa2d48] shrink-0" />
          </label>

          {failed && (
            <p role="alert" className="flex gap-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-sm p-3">
              <TriangleAlert size={16} className="shrink-0 mt-0.5" />
              <span>{job.error}</span>
            </p>
          )}
          {failed && /cookies/i.test(job.error || '') && (
            <button type="button" onClick={() => setView('cookies')} className="w-full flex items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold py-2.5 transition-colors">
              <Cookie size={16} /> Add YouTube cookies
            </button>
          )}

          <button
            type="submit" disabled={!url.trim() || !configured}
            className="w-full rounded-xl bg-accent hover:brightness-110 disabled:bg-white/10 disabled:text-white/30 text-white font-semibold py-3 transition-all"
          >
            {failed ? 'Try again' : 'Import'}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <ul className="space-y-3">
            {steps(job.autoLyrics).map((step) => {
              const idx = ORDER.indexOf(step.key)
              const state = finished || stageIndex > idx ? 'done' : stageIndex === idx ? 'active' : 'todo'
              return <Step key={step.key} label={step.label} state={state} />
            })}
          </ul>
          {running && job.stage === 'queued' && <p className="text-xs text-white/50">Waiting for the server…</p>}

          {job.track && (
            <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
              <Artwork src={withUrls(job.track).artworkUrl} name={job.track.name} className="w-12 h-12 rounded-lg" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{job.track.name}</p>
                <p className="text-xs text-white/50 truncate">{job.track.artist || 'Added to your library'}</p>
              </div>
            </div>
          )}

          {job.warning && (
            <p className="flex gap-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-100 text-sm p-3">
              <TriangleAlert size={16} className="shrink-0 mt-0.5" />
              <span>{job.warning}</span>
            </p>
          )}

          {finished && (
            <div className="flex gap-2">
              <button onClick={() => { onReset(); setUrl('') }} className="flex-1 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold py-3 transition-colors">Add another</button>
              <button onClick={onClose} className="flex-1 rounded-xl bg-accent hover:brightness-110 text-white font-semibold py-3 transition-all">Done</button>
            </div>
          )}
          {running && <p className="text-xs text-white/40">You can close this. The song will appear in your library when it's ready.</p>}
        </div>
      )}

      <div className="mt-5 flex items-center gap-4">
        {!showSettings && (
          <button onClick={() => setShowSettings(true)} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors">
            <Settings size={13} /> Server settings
          </button>
        )}
        <button onClick={() => setView('cookies')} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors">
          <Cookie size={13} /> YouTube cookies
        </button>
      </div>
      </>
      )}
    </Sheet>
  )
}
