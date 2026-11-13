import { useEffect, useRef, useState } from 'react'
import { Loader, Sparkles, TriangleAlert } from 'lucide-react'
import { isServerConfigured, pollJob, saveLyrics, startLyricsGeneration } from '../lib/api'
import ServerSettings from './ServerSettings'
import Sheet from './Sheet'

export default function LyricsEditor({ track, onClose, onSaved }) {
  const [text, setText] = useState(track.lyrics || '')
  const [busy, setBusy] = useState(null) // 'save' | 'generate' | null
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [configured, setConfigured] = useState(isServerConfigured())
  const abortRef = useRef(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const requestClose = () => {
    if (text !== (track.lyrics || '') && !window.confirm('Discard your changes?')) return
    onClose()
  }

  const save = async () => {
    setBusy('save'); setError(''); setNote('')
    try {
      onSaved(await saveLyrics(track.id, text))
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(null)
    }
  }

  const generate = async () => {
    if (track.lyrics && !window.confirm('Replace the saved lyrics with automatically generated ones?')) return
    setBusy('generate'); setError(''); setNote('')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const first = await startLyricsGeneration(track.id)
      const job = await pollJob(first.id, { signal: controller.signal })
      if (job.track?.lyrics) {
        setText(job.track.lyrics)
        onSaved(job.track)
        setNote('Lyrics generated and saved. Check them over and edit anything that sounds off.')
      } else {
        setNote(job.warning || 'No lyrics were found.')
      }
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const loadFile = async (e) => {
    const file = e.target.files?.[0]
    if (file) setText(await file.text())
    e.target.value = ''
  }

  return (
    <Sheet title={`Lyrics · ${track.name}`} onClose={requestClose}>
      {!configured && (
        <div className="mb-4 space-y-2">
          <p className="text-sm text-white/60">Saving lyrics goes through your import server. Connect it first.</p>
          <ServerSettings onSaved={() => setConfigured(true)} />
        </div>
      )}

      <textarea
        value={text} onChange={(e) => setText(e.target.value)} disabled={busy === 'generate'} rows={12}
        placeholder={'Paste lyrics here.\n\nFor lyrics that follow the song, use timestamps:\n[00:12.50] First line\n[00:17.00] Second line'}
        className="w-full rounded-xl bg-white/10 border border-white/10 focus:border-accent/60 outline-none p-3 text-sm text-white placeholder:text-white/30 font-mono leading-relaxed resize-y"
      />

      <div className="mt-2 flex items-center justify-between text-xs text-white/40">
        <span>Plain text or .lrc format</span>
        <label className="cursor-pointer hover:text-white/70 transition-colors">
          Load from file
          <input type="file" accept=".lrc,.txt,text/plain" className="hidden" onChange={loadFile} />
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-3 flex gap-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-sm p-3">
          <TriangleAlert size={16} className="shrink-0 mt-0.5" /><span>{error}</span>
        </p>
      )}
      {note && <p className="mt-3 text-sm text-emerald-300">{note}</p>}

      <div className="mt-4 flex gap-2">
        <button
          onClick={generate} disabled={!configured || busy !== null}
          className="flex-1 flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white text-sm font-semibold py-3 transition-colors"
        >
          {busy === 'generate' ? <Loader size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {busy === 'generate' ? 'Listening…' : 'Auto-generate'}
        </button>
        <button
          onClick={save} disabled={!configured || busy !== null}
          className="flex-1 rounded-xl bg-accent hover:brightness-110 disabled:opacity-40 text-white text-sm font-semibold py-3 transition-all"
        >
          {busy === 'save' ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Sheet>
  )
}
