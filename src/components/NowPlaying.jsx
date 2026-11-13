import { useEffect, useState } from 'react'
import { ChevronDown, Quote } from 'lucide-react'
import Artwork from './Artwork'
import Lyrics from './Lyrics'
import { Controls, ProgressBar, Volume } from './Transport'

/** Full-screen "Now Playing" in the style of Apple Music: blurred cover backdrop, big artwork, synced lyrics. */
export default function NowPlaying({
  track, isPlaying, currentTime, duration, onSeek, onClose, onEditLyrics,
  shuffle, repeat, onShuffle, onRepeat, onPrev, onNext, onPlayPause,
  volume, muted, onVolume, onToggleMute,
}) {
  const [showLyrics, setShowLyrics] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const artist = track.artist || 'My Music'

  return (
    <div role="dialog" aria-label="Now playing" className="fixed inset-0 z-40 flex flex-col bg-black text-white animate-sheet-up overflow-hidden">
      {/* Backdrop: the cover, blown up and blurred */}
      <div aria-hidden className="absolute inset-0">
        {track.artworkUrl ? (
          <img src={track.artworkUrl} alt="" className="w-full h-full object-cover scale-125 blur-2xl saturate-150 opacity-80" />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-zinc-700 via-zinc-900 to-black" />
        )}
        <div className="absolute inset-0 bg-black/45" />
      </div>

      <div className="relative z-10 flex flex-col h-full w-full max-w-5xl mx-auto">
        <header className="flex items-center justify-between px-4 pt-3 pb-1">
          <button onClick={onClose} aria-label="Close player" className="p-2 rounded-full text-white/80 hover:text-white transition-colors">
            <ChevronDown size={28} />
          </button>
          <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-white/50">Now Playing</span>
          <button
            onClick={() => setShowLyrics((v) => !v)}
            aria-label={showLyrics ? 'Show artwork' : 'Show lyrics'}
            aria-pressed={showLyrics}
            className={`md:invisible p-2 rounded-full transition-colors ${showLyrics ? 'bg-white text-black' : 'text-white/80 hover:text-white'}`}
          >
            <Quote size={20} fill="currentColor" />
          </button>
        </header>

        <main className="flex-1 min-h-0 flex flex-col md:flex-row md:gap-10 md:px-10">
          {/* Artwork + title */}
          <section className={`${showLyrics ? 'hidden md:flex' : 'flex'} flex-col items-center justify-center flex-1 min-h-0 px-8 md:px-0`}>
            <Artwork
              src={track.artworkUrl} name={track.name} iconSize={64}
              className={`aspect-square w-[min(80vw,40vh)] md:w-[min(34vw,52vh)] rounded-2xl shadow-2xl shadow-black/60 transition-transform duration-500 ${isPlaying ? 'scale-100' : 'scale-[0.88]'}`}
            />
            <div className="mt-6 w-full max-w-sm min-w-0 text-center">
              <h2 className="text-2xl font-bold truncate">{track.name}</h2>
              <p className="text-lg text-white/60 truncate">{artist}</p>
            </div>
          </section>

          {/* Lyrics */}
          <section className={`${showLyrics ? 'flex' : 'hidden md:flex'} flex-col flex-1 min-h-0 md:py-4`}>
            {showLyrics && (
              <div className="md:hidden flex items-center gap-3 px-6 pb-3">
                <Artwork src={track.artworkUrl} name={track.name} className="w-12 h-12 rounded-lg" />
                <div className="min-w-0">
                  <p className="font-bold truncate">{track.name}</p>
                  <p className="text-sm text-white/60 truncate">{artist}</p>
                </div>
              </div>
            )}
            <Lyrics key={track.id} lyrics={track.lyrics} currentTime={currentTime} onSeek={onSeek} onEdit={onEditLyrics} />
          </section>
        </main>

        <footer className="px-6 md:px-10 pt-2 pb-[max(env(safe-area-inset-bottom),16px)] max-w-xl w-full mx-auto">
          <ProgressBar currentTime={currentTime} duration={duration} onSeek={onSeek} showTimes />
          <div className="mt-1">
            <Controls
              isPlaying={isPlaying} shuffle={shuffle} repeat={repeat}
              onShuffle={onShuffle} onRepeat={onRepeat} onPrev={onPrev} onNext={onNext} onPlayPause={onPlayPause}
            />
          </div>
          <Volume volume={volume} muted={muted} onVolume={onVolume} onToggleMute={onToggleMute} className="hidden md:flex justify-center mt-3" />
        </footer>
      </div>
    </div>
  )
}
