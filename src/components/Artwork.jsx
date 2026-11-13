import { useState } from 'react'
import { Music } from 'lucide-react'

function hueFor(name = '') {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

/** Cover image with a colourful placeholder for tracks that have none. */
export default function Artwork({ src, name, className = '', iconSize = 18 }) {
  const [failedSrc, setFailedSrc] = useState(null)
  const showImage = src && failedSrc !== src
  const hue = hueFor(name)
  return (
    <div
      className={`relative overflow-hidden shrink-0 flex items-center justify-center text-white/80 ${className}`}
      style={showImage ? undefined : { background: name ? `linear-gradient(135deg, hsl(${hue} 55% 38%), hsl(${(hue + 40) % 360} 60% 24%))` : '#27272a' }}
    >
      {showImage ? (
        <img src={src} alt="" className="w-full h-full object-cover" draggable="false" onError={() => setFailedSrc(src)} />
      ) : (
        <Music size={iconSize} />
      )}
    </div>
  )
}
