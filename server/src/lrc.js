// Speech-to-text hallucinations that show up over music, silence and outros.
const HALLUCINATIONS = [
  /thanks? for watching/i,
  /please subscribe/i,
  /subtitles? by/i,
  /amara\.org/i,
  /transcribed by/i,
  /^\W*(music|applause|instrumental)\W*$/i,
  /^[^\p{L}\p{N}]*$/u, // no letters or digits at all (just ♪, punctuation, emoji…)
]

/**
 * Drops segments that are probably not singing: very likely silence, low
 * confidence, known filler phrases and the same line repeated over and over.
 */
export function cleanSegments(segments = []) {
  const out = []
  let repeat = 0
  for (const seg of segments) {
    const text = String(seg.text || '').trim()
    if (!text) continue
    if (typeof seg.no_speech_prob === 'number' && seg.no_speech_prob > 0.6) continue
    if (typeof seg.avg_logprob === 'number' && seg.avg_logprob < -1.3) continue
    if (HALLUCINATIONS.some((re) => re.test(text))) continue

    const prev = out[out.length - 1]
    if (prev && prev.text.toLowerCase() === text.toLowerCase()) {
      repeat += 1
      if (repeat >= 3) continue // a loop of one line is a Whisper glitch, not a chorus
    } else {
      repeat = 0
    }
    out.push({ start: Math.max(0, Number(seg.start) || 0), text })
  }
  return out
}

export function formatTimestamp(seconds) {
  const total = Math.max(0, seconds)
  const m = Math.floor(total / 60)
  const s = total - m * 60
  return `[${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}]`
}

/** Builds synced lyrics in LRC format: one "[mm:ss.xx]line" per segment. */
export function segmentsToLrc(segments) {
  return cleanSegments(segments)
    .map((s) => `${formatTimestamp(s.start)}${s.text}`)
    .join('\n')
}
