import { useState, useEffect, useRef, useCallback } from 'react'
import { getAllTracks, addTrack, deleteTrack, withUrls } from './db'
import { useImportJob } from './useImportJob'
import Artwork from './components/Artwork'
import ImportModal from './components/ImportModal'
import LyricsEditor from './components/LyricsEditor'
import NowPlaying from './components/NowPlaying'
import { Controls, ProgressBar, Volume } from './components/Transport'
import { formatTime } from './lib/format'
import { Plus, Trash2, Music, List, Link as LinkIcon, Loader, Check, TriangleAlert } from 'lucide-react'
import './App.css'

const STAGE_LABELS = {
  queued: 'Waiting for the server…',
  downloading: 'Downloading from YouTube…',
  saving: 'Saving to your library…',
  transcribing: 'Listening for lyrics…',
}

function App() {
  const [tracks, setTracks] = useState([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState(0) // 0=off, 1=all, 2=one
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [showList, setShowList] = useState(true)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showNowPlaying, setShowNowPlaying] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingLyrics, setEditingLyrics] = useState(false)

  const audioRef = useRef(null)
  const fileInputRef = useRef(null)

  const currentTrack = currentIndex >= 0 ? tracks[currentIndex] : null

  // Adds a track, or refreshes it in place when the server updates it (e.g. lyrics arrive).
  const upsertTrack = useCallback((row) => {
    const track = withUrls(row)
    setTracks((prev) =>
      prev.some((t) => t.id === track.id) ? prev.map((t) => (t.id === track.id ? track : t)) : [...prev, track]
    )
  }, [])

  const { job, start: startImport, reset: resetImport } = useImportJob(upsertTrack)

  // Load tracks from Supabase on mount
  useEffect(() => {
    getAllTracks().then((t) => {
      setTracks(t)
      if (t.length > 0) setShowList(true)
    })
  }, [])

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !audio.src) return
    if (audio.paused) {
      audio.play().then(() => setIsPlaying(true)).catch(() => {})
    } else {
      audio.pause()
      setIsPlaying(false)
    }
  }, [])

  const getNextIndex = useCallback(() => {
    if (tracks.length === 0) return -1
    if (repeat === 2) return currentIndex
    if (shuffle) {
      if (tracks.length === 1) return 0
      let next
      do { next = Math.floor(Math.random() * tracks.length) } while (next === currentIndex)
      return next
    }
    const next = currentIndex + 1
    if (next >= tracks.length) return repeat === 1 ? 0 : -1
    return next
  }, [tracks, currentIndex, shuffle, repeat])

  const handleNext = useCallback(() => {
    const next = getNextIndex()
    if (next >= 0) {
      setCurrentIndex(next)
      setIsPlaying(true)
    }
  }, [getNextIndex])

  const handlePrev = useCallback(() => {
    if (!audioRef.current) return
    if (audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0
      return
    }
    const prev = currentIndex - 1
    if (prev >= 0) {
      setCurrentIndex(prev)
      setIsPlaying(true)
    } else if (repeat === 1) {
      setCurrentIndex(tracks.length - 1)
      setIsPlaying(true)
    }
  }, [currentIndex, tracks, repeat])

  const seekTo = useCallback((seconds) => {
    if (!audioRef.current) return
    audioRef.current.currentTime = seconds
    setCurrentTime(seconds)
  }, [])

  const handleVolume = useCallback((v) => {
    setVolume(v)
    setMuted(v === 0)
    if (audioRef.current) audioRef.current.volume = v
  }, [])

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted
  }, [muted])

  // Set audio source when track changes
  useEffect(() => {
    const track = currentIndex >= 0 ? tracks[currentIndex] : null
    if (!track) return

    const audio = audioRef.current
    audio.src = track.url
    audio.load()
    audio.play().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex])

  // Lock-screen / notification metadata (also refreshes when the cover or title arrives)
  const metaName = currentTrack?.name
  const metaArtist = currentTrack?.artist
  const metaArtwork = currentTrack?.artworkUrl
  useEffect(() => {
    if (!metaName || !('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: metaName,
      artist: metaArtist || 'My Music',
      album: 'My Library',
      artwork: metaArtwork ? [{ src: metaArtwork, sizes: '640x640', type: 'image/jpeg' }] : [],
    })
  }, [metaName, metaArtist, metaArtwork])

  // Media Session action handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.setActionHandler('play', () => handlePlayPause())
    navigator.mediaSession.setActionHandler('pause', () => handlePlayPause())
    navigator.mediaSession.setActionHandler('previoustrack', () => handlePrev())
    navigator.mediaSession.setActionHandler('nexttrack', () => handleNext())
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime != null) seekTo(details.seekTime)
    })
    return () => {
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
      navigator.mediaSession.setActionHandler('previoustrack', null)
      navigator.mediaSession.setActionHandler('nexttrack', null)
      navigator.mediaSession.setActionHandler('seekto', null)
    }
  }, [handlePlayPause, handlePrev, handleNext, seekTo])

  const handleTrackEnd = () => {
    const next = getNextIndex()
    if (next >= 0) {
      setCurrentIndex(next)
      setIsPlaying(true)
    } else {
      setIsPlaying(false)
    }
  }

  const handleFiles = async (files) => {
    const mp3Files = Array.from(files).filter((f) =>
      f.type === 'audio/mpeg' || f.name.toLowerCase().endsWith('.mp3')
    )
    if (mp3Files.length === 0) return
    setUploading(true)
    try {
      const newTracks = []
      for (const file of mp3Files) {
        const track = await addTrack(file)
        newTracks.push(track)
      }
      setTracks((prev) => [...prev, ...newTracks])
      if (currentIndex < 0) {
        setCurrentIndex(tracks.length)
        setIsPlaying(true)
      }
    } catch (err) {
      console.error('Upload failed:', err)
      alert('Upload failed: ' + (err.message || err))
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (e, track, idx) => {
    e.stopPropagation()
    await deleteTrack(track.id, track.file_path, track.artwork_path)
    setTracks((prev) => prev.filter((t) => t.id !== track.id))
    if (idx === currentIndex) {
      audioRef.current.pause()
      setIsPlaying(false)
      setCurrentIndex(-1)
      setCurrentTime(0)
      setDuration(0)
      setShowNowPlaying(false)
      setEditingLyrics(false)
    } else if (idx < currentIndex) {
      setCurrentIndex((prev) => prev - 1)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  const importRunning = job && (job.status === 'queued' || job.status === 'running')
  const controlProps = {
    isPlaying, shuffle, repeat,
    onShuffle: () => setShuffle((s) => !s),
    onRepeat: () => setRepeat((r) => (r + 1) % 3),
    onPrev: handlePrev,
    onNext: handleNext,
    onPlayPause: handlePlayPause,
  }

  return (
    <div
      className="min-h-[100dvh] flex flex-col bg-gradient-to-b from-[#0a0a14] via-[#0f0f23] to-[#0a0a14] select-none"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onTimeUpdate={() => setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={() => setDuration(audioRef.current.duration)}
        onEnded={handleTrackEnd}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        preload="auto"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,audio/mpeg"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Drag overlay */}
      {dragOver && (
        <div className="fixed inset-0 z-50 bg-accent/20 backdrop-blur-sm flex items-center justify-center">
          <div className="text-2xl font-semibold text-white flex flex-col items-center gap-3">
            <Plus size={48} />
            Drop MP3 files here
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-4 pb-2 sm:px-6">
        <div className="flex items-center gap-2">
          <Music className="text-accent" size={24} />
          <h1 className="text-lg font-bold text-white tracking-tight">My Music</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowList(!showList)}
            aria-label="Toggle library"
            className={`p-2 rounded-xl transition-colors ${showList ? 'bg-accent/20 text-accent' : 'text-zinc-400 hover:text-white'}`}
          >
            <List size={20} />
          </button>
          <button
            onClick={() => setShowImport(true)}
            aria-label="Add from YouTube"
            className="p-2 rounded-xl bg-accent hover:brightness-110 text-white transition-all"
          >
            <LinkIcon size={20} />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            aria-label="Upload MP3 files"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <Plus size={20} />
          </button>
        </div>
      </header>

      {/* Upload indicator */}
      {uploading && (
        <div className="mx-4 sm:mx-6 mb-2 px-4 py-2 rounded-xl bg-accent/15 border border-accent/30 flex items-center gap-3 text-white text-sm font-medium">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Uploading...
        </div>
      )}

      {/* YouTube import status (when the dialog is closed) */}
      {job && !showImport && (
        <button
          onClick={() => setShowImport(true)}
          className={`mx-4 sm:mx-6 mb-2 px-4 py-2 rounded-xl border flex items-center gap-3 text-sm font-medium text-left ${
            job.status === 'error'
              ? 'bg-red-500/15 border-red-500/30 text-red-200'
              : 'bg-accent/15 border-accent/30 text-white'
          }`}
        >
          {importRunning && <Loader size={16} className="animate-spin text-accent shrink-0" />}
          {job.status === 'done' && <Check size={16} className="text-emerald-400 shrink-0" />}
          {job.status === 'error' && <TriangleAlert size={16} className="shrink-0" />}
          <span className="truncate">
            {importRunning && (STAGE_LABELS[job.stage] || 'Importing…')}
            {job.status === 'done' && `Added “${job.track?.name ?? 'song'}”${job.warning ? ' (tap for details)' : ''}`}
            {job.status === 'error' && job.error}
          </span>
        </button>
      )}

      {/* Track list */}
      {showList && (
        <div className="flex-1 overflow-y-auto px-3 sm:px-5 pb-4">
          {tracks.length === 0 && !uploading ? (
            <div
              className="flex flex-col items-center justify-center h-64 text-zinc-500 cursor-pointer rounded-2xl border-2 border-dashed border-zinc-700/60 hover:border-accent/50 transition-colors mt-4"
              onClick={() => setShowImport(true)}
            >
              <Music size={48} className="mb-3 text-zinc-600" />
              <p className="text-base font-medium">No tracks yet</p>
              <p className="text-sm mt-1">Tap here to add a YouTube link, or drag MP3 files in</p>
            </div>
          ) : (
            <ul className="space-y-1 mt-2">
              {tracks.map((track, idx) => (
                <li
                  key={track.id}
                  onClick={() => { setCurrentIndex(idx); setIsPlaying(true) }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all group
                    ${idx === currentIndex
                      ? 'bg-accent/15 border border-accent/30'
                      : 'hover:bg-white/5 border border-transparent'
                    }`}
                >
                  <div className="relative">
                    <Artwork src={track.artworkUrl} name={track.name} className="w-11 h-11 rounded-lg" iconSize={16} />
                    {idx === currentIndex && isPlaying && (
                      <div className="absolute inset-0 rounded-lg bg-black/50 flex items-center justify-center">
                        <div className="flex items-end gap-[2px] h-4">
                          <span className="w-[3px] bg-white rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" style={{ height: '60%' }} />
                          <span className="w-[3px] bg-white rounded-full animate-[bounce_0.6s_ease-in-out_infinite_0.15s]" style={{ height: '100%' }} />
                          <span className="w-[3px] bg-white rounded-full animate-[bounce_0.6s_ease-in-out_infinite_0.3s]" style={{ height: '40%' }} />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`truncate text-sm font-medium ${idx === currentIndex ? 'text-accent' : 'text-zinc-200'}`}>
                      {track.name}
                    </p>
                    {track.artist && <p className="truncate text-xs text-zinc-500">{track.artist}</p>}
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, track, idx)}
                    aria-label={`Delete ${track.name}`}
                    className="sm:opacity-0 sm:group-hover:opacity-100 p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-all"
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Player controls - fixed at bottom */}
      <div className="sticky bottom-0 bg-[#0d0d1a]/95 backdrop-blur-xl border-t border-white/5 px-4 pb-[env(safe-area-inset-bottom,8px)] pt-3 sm:px-6">
        {/* Track info (tap to open Now Playing) */}
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={() => currentTrack && setShowNowPlaying(true)}
            disabled={!currentTrack}
            aria-label="Open now playing"
            className="flex items-center gap-3 min-w-0 flex-1 text-left"
          >
            <Artwork src={currentTrack?.artworkUrl} name={currentTrack?.name} className="w-10 h-10 rounded-lg" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {currentTrack?.name || 'No track selected'}
              </p>
              <p className="text-xs text-zinc-500 truncate">
                {currentTrack
                  ? `${currentTrack.artist ? `${currentTrack.artist} · ` : ''}${formatTime(currentTime)} / ${formatTime(duration)}`
                  : '--:-- / --:--'}
              </p>
            </div>
          </button>
          <Volume volume={volume} muted={muted} onVolume={handleVolume} onToggleMute={() => setMuted((m) => !m)} className="hidden sm:flex" />
        </div>

        <ProgressBar currentTime={currentTime} duration={duration} onSeek={seekTo} />

        <div className="pb-1">
          <Controls {...controlProps} disabled={!currentTrack} />
        </div>
      </div>

      {showNowPlaying && currentTrack && (
        <NowPlaying
          track={currentTrack}
          currentTime={currentTime}
          duration={duration}
          onSeek={seekTo}
          onClose={() => setShowNowPlaying(false)}
          onEditLyrics={() => setEditingLyrics(true)}
          volume={volume}
          muted={muted}
          onVolume={handleVolume}
          onToggleMute={() => setMuted((m) => !m)}
          {...controlProps}
        />
      )}

      {editingLyrics && currentTrack && (
        <LyricsEditor
          key={currentTrack.id}
          track={currentTrack}
          onClose={() => setEditingLyrics(false)}
          onSaved={upsertTrack}
        />
      )}

      {showImport && (
        <ImportModal job={job} onStart={startImport} onReset={resetImport} onClose={() => setShowImport(false)} />
      )}
    </div>
  )
}

export default App
