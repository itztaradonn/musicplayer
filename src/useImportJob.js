import { useCallback, useEffect, useRef, useState } from 'react'
import { pollJob, startImport } from './lib/api'

/** Runs a YouTube import on the server and reports each stage. `onTrack` fires when the song or its lyrics change. */
export function useImportJob(onTrack) {
  const [job, setJob] = useState(null)
  const abortRef = useRef(null)
  const lastTrack = useRef('')

  useEffect(() => () => abortRef.current?.abort(), [])

  const start = useCallback(async (url, autoLyrics) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    lastTrack.current = ''
    setJob({ status: 'queued', stage: 'queued', autoLyrics })
    try {
      const first = await startImport(url, autoLyrics)
      await pollJob(first.id, {
        signal: controller.signal,
        onUpdate: (j) => {
          setJob({ ...j, autoLyrics })
          const signature = JSON.stringify(j.track)
          if (j.track && signature !== lastTrack.current) {
            lastTrack.current = signature
            onTrack(j.track)
          }
        },
      })
    } catch (err) {
      if (err.name === 'AbortError') return
      setJob((prev) => ({ ...prev, status: 'error', error: err.message, autoLyrics }))
    }
  }, [onTrack])

  const reset = useCallback(() => setJob(null), [])
  return { job, start, reset }
}
