import { useRef } from 'react'
import { formatTime } from '../lib/format'
import { Play, Pause, SkipBack, SkipForward, Repeat, Shuffle, Volume2, VolumeX } from 'lucide-react'

/** Draggable progress bar (mouse, touch and pen). */
export function ProgressBar({ currentTime, duration, onSeek, showTimes = false }) {
  const barRef = useRef(null)
  const dragging = useRef(false)
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  const seekTo = (e) => {
    const rect = barRef.current.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onSeek(pct * duration)
  }

  return (
    <div>
      <div
        ref={barRef}
        className="relative h-6 flex items-center cursor-pointer group touch-none"
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); seekTo(e) }}
        onPointerMove={(e) => { if (dragging.current) seekTo(e) }}
        onPointerUp={() => { dragging.current = false }}
        onPointerCancel={() => { dragging.current = false }}
      >
        <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden group-hover:h-1.5 transition-all">
          <div className="h-full bg-white/90 rounded-full" style={{ width: `${progress}%` }} />
        </div>
      </div>
      {showTimes && (
        <div className="flex justify-between text-[11px] font-medium text-white/50 tabular-nums -mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>-{formatTime(Math.max(0, duration - currentTime))}</span>
        </div>
      )}
    </div>
  )
}

export function Controls({ isPlaying, disabled, shuffle, repeat, onShuffle, onRepeat, onPrev, onNext, onPlayPause }) {
  return (
    <div className={`flex items-center justify-center gap-3 sm:gap-5`}>
      <button onClick={onShuffle} aria-label="Shuffle" className={`p-2 rounded-lg transition-colors ${shuffle ? 'text-accent bg-accent/10' : 'text-white/50 hover:text-white'}`}>
        <Shuffle size={18} />
      </button>
      <button onClick={onPrev} aria-label="Previous" className="p-2 text-white/90 hover:text-white transition-colors active:scale-90">
        <SkipBack size={22} fill="currentColor" />
      </button>
      <button
        onClick={onPlayPause}
        disabled={disabled}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        className={`w-14 h-14 rounded-full bg-white text-black disabled:bg-white/20 disabled:text-white/40 flex items-center justify-center transition-all active:scale-90 shadow-lg`}
      >
        {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
      </button>
      <button onClick={onNext} aria-label="Next" className="p-2 text-white/90 hover:text-white transition-colors active:scale-90">
        <SkipForward size={22} fill="currentColor" />
      </button>
      <button onClick={onRepeat} aria-label="Repeat" className={`p-2 rounded-lg transition-colors relative ${repeat > 0 ? 'text-accent bg-accent/10' : 'text-white/50 hover:text-white'}`}>
        <Repeat size={18} />
        {repeat === 2 && (
          <span className="absolute -top-0.5 -right-0.5 text-[9px] font-bold bg-accent text-white w-3.5 h-3.5 rounded-full flex items-center justify-center">1</span>
        )}
      </button>
    </div>
  )
}

export function Volume({ volume, muted, onVolume, onToggleMute, className = '' }) {
  return (
    <div className={`items-center gap-2 ${className}`}>
      <button onClick={onToggleMute} aria-label={muted ? 'Unmute' : 'Mute'} className="text-white/50 hover:text-white transition-colors">
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
      <input
        type="range" min="0" max="1" step="0.01"
        value={muted ? 0 : volume}
        onChange={(e) => onVolume(parseFloat(e.target.value))}
        aria-label="Volume"
        className="w-24 accent-white"
      />
    </div>
  )
}
