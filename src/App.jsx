import { useState, useEffect, useRef, useCallback } from 'react'
import { getAllTracks, addTrack, deleteTrack } from './db'
import {
  Play, Pause, SkipBack, SkipForward, Plus, Trash2,
  Music, Repeat, Shuffle, Volume2, VolumeX, List
} from 'lucide-react'
import './App.css'

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
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

  const audioRef = useRef(null)
  const fileInputRef = useRef(null)
  const blobUrlRef = useRef(null)
  const progressRef = useRef(null)

  const currentTrack = currentIndex >= 0 ? tracks[currentIndex] : null

  // Load tracks from IndexedDB on mount
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

  // Create blob URL when track changes
  useEffect(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    const track = currentIndex >= 0 ? tracks[currentIndex] : null
    if (!track) return

    const blob = new Blob([track.data], { type: track.type || 'audio/mpeg' })
    const url = URL.createObjectURL(blob)
    blobUrlRef.current = url

    const audio = audioRef.current
    audio.src = url
    audio.load()
    audio.play().catch(() => {})

    // Media Session metadata
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.name,
        artist: 'My Music',
        album: 'My Library',
      })
    }

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex])

  // Media Session action handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.setActionHandler('play', () => handlePlayPause())
    navigator.mediaSession.setActionHandler('pause', () => handlePlayPause())
    navigator.mediaSession.setActionHandler('previoustrack', () => handlePrev())
    navigator.mediaSession.setActionHandler('nexttrack', () => handleNext())
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (audioRef.current && details.seekTime != null) {
        audioRef.current.currentTime = details.seekTime
        setCurrentTime(details.seekTime)
      }
    })
    return () => {
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
      navigator.mediaSession.setActionHandler('previoustrack', null)
      navigator.mediaSession.setActionHandler('nexttrack', null)
      navigator.mediaSession.setActionHandler('seekto', null)
    }
  }, [handlePlayPause, handlePrev, handleNext])

  const handleTrackEnd = () => {
    const next = getNextIndex()
    if (next >= 0) {
      setCurrentIndex(next)
      setIsPlaying(true)
    } else {
      setIsPlaying(false)
    }
  }

  const handleSeek = (e) => {
    const rect = progressRef.current.getBoundingClientRect()
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left
    const pct = Math.max(0, Math.min(1, x / rect.width))
    audioRef.current.currentTime = pct * duration
    setCurrentTime(pct * duration)
  }

  const handleFiles = async (files) => {
    const mp3Files = Array.from(files).filter((f) =>
      f.type === 'audio/mpeg' || f.name.toLowerCase().endsWith('.mp3')
    )
    const newTracks = []
    for (const file of mp3Files) {
      const track = await addTrack(file)
      newTracks.push(track)
    }
    if (newTracks.length > 0) {
      setTracks((prev) => [...prev, ...newTracks])
      if (currentIndex < 0) {
        setCurrentIndex(tracks.length)
        setIsPlaying(true)
      }
    }
  }

  const handleDelete = async (e, id, idx) => {
    e.stopPropagation()
    await deleteTrack(id)
    setTracks((prev) => prev.filter((t) => t.id !== id))
    if (idx === currentIndex) {
      audioRef.current.pause()
      setIsPlaying(false)
      setCurrentIndex(-1)
      setCurrentTime(0)
      setDuration(0)
    } else if (idx < currentIndex) {
      setCurrentIndex((prev) => prev - 1)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

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
        <div className="fixed inset-0 z-50 bg-violet-600/20 backdrop-blur-sm flex items-center justify-center">
          <div className="text-2xl font-semibold text-violet-300 flex flex-col items-center gap-3">
            <Plus size={48} />
            Drop MP3 files here
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-4 pb-2 sm:px-6">
        <div className="flex items-center gap-2">
          <Music className="text-violet-400" size={24} />
          <h1 className="text-lg font-bold text-white tracking-tight">My Music</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowList(!showList)}
            className={`p-2 rounded-xl transition-colors ${showList ? 'bg-violet-600/30 text-violet-300' : 'text-zinc-400 hover:text-white'}`}
          >
            <List size={20} />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white transition-colors"
          >
            <Plus size={20} />
          </button>
        </div>
      </header>

      {/* Track list */}
      {showList && (
        <div className="flex-1 overflow-y-auto px-3 sm:px-5 pb-4">
          {tracks.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center h-64 text-zinc-500 cursor-pointer rounded-2xl border-2 border-dashed border-zinc-700/60 hover:border-violet-500/50 transition-colors mt-4"
              onClick={() => fileInputRef.current?.click()}
            >
              <Music size={48} className="mb-3 text-zinc-600" />
              <p className="text-base font-medium">No tracks yet</p>
              <p className="text-sm mt-1">Tap here or drag MP3 files to add music</p>
            </div>
          ) : (
            <ul className="space-y-1 mt-2">
              {tracks.map((track, idx) => (
                <li
                  key={track.id}
                  onClick={() => { setCurrentIndex(idx); setIsPlaying(true) }}
                  className={`flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all group
                    ${idx === currentIndex
                      ? 'bg-violet-600/20 border border-violet-500/30'
                      : 'hover:bg-white/5 border border-transparent'
                    }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0
                    ${idx === currentIndex ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                    {idx === currentIndex && isPlaying ? (
                      <div className="flex items-end gap-[2px] h-4">
                        <span className="w-[3px] bg-white rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" style={{ height: '60%' }} />
                        <span className="w-[3px] bg-white rounded-full animate-[bounce_0.6s_ease-in-out_infinite_0.15s]" style={{ height: '100%' }} />
                        <span className="w-[3px] bg-white rounded-full animate-[bounce_0.6s_ease-in-out_infinite_0.3s]" style={{ height: '40%' }} />
                      </div>
                    ) : (
                      <Music size={16} />
                    )}
                  </div>
                  <span className={`flex-1 truncate text-sm font-medium ${idx === currentIndex ? 'text-violet-200' : 'text-zinc-300'}`}>
                    {track.name}
                  </span>
                  <button
                    onClick={(e) => handleDelete(e, track.id, idx)}
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
        {/* Track info */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${currentTrack ? 'bg-gradient-to-br from-violet-600 to-fuchsia-600' : 'bg-zinc-800'}`}>
              <Music size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {currentTrack?.name || 'No track selected'}
              </p>
              <p className="text-xs text-zinc-500">
                {currentTrack ? `${formatTime(currentTime)} / ${formatTime(duration)}` : '--:-- / --:--'}
              </p>
            </div>
          </div>
          {/* Volume - desktop only */}
          <div className="hidden sm:flex items-center gap-2">
            <button onClick={() => setMuted(!muted)} className="text-zinc-400 hover:text-white transition-colors">
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={muted ? 0 : volume}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                setVolume(v)
                setMuted(v === 0)
                if (audioRef.current) audioRef.current.volume = v
              }}
              className="w-20 accent-violet-500"
            />
          </div>
        </div>

        {/* Progress bar */}
        <div
          ref={progressRef}
          className="relative h-6 flex items-center cursor-pointer group mb-2"
          onClick={handleSeek}
          onTouchMove={handleSeek}
        >
          <div className="w-full h-1 bg-zinc-700/60 rounded-full overflow-hidden group-hover:h-1.5 transition-all">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full relative"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3 sm:gap-5 pb-1">
          <button
            onClick={() => setShuffle(!shuffle)}
            className={`p-2 rounded-lg transition-colors ${shuffle ? 'text-violet-400 bg-violet-400/10' : 'text-zinc-500 hover:text-white'}`}
          >
            <Shuffle size={18} />
          </button>
          <button
            onClick={handlePrev}
            className="p-2 text-zinc-300 hover:text-white transition-colors active:scale-90"
          >
            <SkipBack size={22} fill="currentColor" />
          </button>
          <button
            onClick={handlePlayPause}
            disabled={!currentTrack}
            className="w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white flex items-center justify-center transition-all active:scale-90 shadow-lg shadow-violet-600/30"
          >
            {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
          </button>
          <button
            onClick={handleNext}
            className="p-2 text-zinc-300 hover:text-white transition-colors active:scale-90"
          >
            <SkipForward size={22} fill="currentColor" />
          </button>
          <button
            onClick={() => setRepeat((r) => (r + 1) % 3)}
            className={`p-2 rounded-lg transition-colors relative ${repeat > 0 ? 'text-violet-400 bg-violet-400/10' : 'text-zinc-500 hover:text-white'}`}
          >
            <Repeat size={18} />
            {repeat === 2 && (
              <span className="absolute -top-0.5 -right-0.5 text-[9px] font-bold bg-violet-500 text-white w-3.5 h-3.5 rounded-full flex items-center justify-center">
                1
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
