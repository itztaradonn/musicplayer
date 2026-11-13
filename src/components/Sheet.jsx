import { useEffect } from 'react'
import { X } from 'lucide-react'

/** Bottom sheet on phones, centred dialog on larger screens. */
export default function Sheet({ title, onClose, children }) {
  useEffect(() => {
    // Capture phase + stopPropagation so Escape closes only this sheet, not the Now Playing view under it
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#1c1c1e] border border-white/10 p-5 animate-sheet-up"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-full bg-white/10 text-white/70 hover:text-white">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
