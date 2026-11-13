import { useEffect, useMemo, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import { activeLineIndex, parseLyrics } from '../lib/lrc'

/**
 * Apple Music-style lyrics: the line being sung is big and white, the rest fade and
 * blur with distance, and the view follows along. Tap a line to jump to it.
 * Falls back to static text for lyrics without timing. Mount with key={track.id}.
 */
export default function Lyrics({ lyrics, currentTime, onSeek, onEdit }) {
  const { synced, lines } = useMemo(() => parseLyrics(lyrics), [lyrics])
  const active = synced ? activeLineIndex(lines, currentTime) : -1

  const scrollRef = useRef(null)
  const lineRefs = useRef([])
  const hasScrolled = useRef(false)
  const browseTimer = useRef(null)
  const [browsing, setBrowsing] = useState(false)

  // Follow the music, unless the user is scrolling around by hand.
  useEffect(() => {
    const box = scrollRef.current
    const el = lineRefs.current[active]
    if (!box || !el || browsing) return
    box.scrollTo({
      top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2,
      behavior: hasScrolled.current ? 'smooth' : 'auto',
    })
    hasScrolled.current = true
  }, [active, browsing])

  useEffect(() => () => clearTimeout(browseTimer.current), [])

  const markBrowsing = () => {
    setBrowsing(true)
    clearTimeout(browseTimer.current)
    browseTimer.current = setTimeout(() => setBrowsing(false), 3500)
  }

  if (!lines.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
        <p className="text-white/50 text-lg font-semibold">No lyrics yet</p>
        <button onClick={onEdit} className="px-5 py-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-sm font-semibold transition-colors">
          Add lyrics
        </button>
      </div>
    )
  }

  return (
    <div className="relative flex-1 min-h-0">
      <button
        onClick={onEdit}
        aria-label="Edit lyrics"
        className="absolute top-1 right-3 z-10 p-2 rounded-full bg-black/30 backdrop-blur text-white/70 hover:text-white transition-colors"
      >
        <Pencil size={16} />
      </button>
      <div
        ref={scrollRef}
        onWheel={markBrowsing}
        onTouchStart={markBrowsing}
        onTouchMove={markBrowsing}
        className="absolute inset-0 overflow-y-auto px-6 sm:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)]"
      >
        <div className={`relative ${synced ? 'py-[40%]' : 'py-8'}`}>
          {lines.map((line, i) => {
            if (!synced) {
              return line.text ? (
                <p key={i} className="text-xl font-semibold leading-snug text-white/90 py-1">{line.text}</p>
              ) : (
                <div key={i} className="h-5" />
              )
            }
            const distance = Math.abs(i - active)
            const isActive = i === active
            return (
              <p
                key={i}
                ref={(node) => { lineRefs.current[i] = node }}
                onClick={() => onSeek(Math.max(0, line.time))}
                style={{ filter: isActive || browsing ? 'none' : `blur(${Math.min(distance, 4) * 0.6}px)` }}
                className={`origin-left cursor-pointer py-2 text-[1.7rem] sm:text-3xl font-bold leading-tight transition-all duration-500 ${
                  isActive ? 'text-white scale-100' : 'text-white/35 scale-[0.94] hover:text-white/60'
                }`}
              >
                {line.text || <span className="tracking-[0.4em] opacity-60">• • •</span>}
              </p>
            )
          })}
        </div>
      </div>
    </div>
  )
}
