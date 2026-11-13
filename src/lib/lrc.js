// Parses lyrics text. Understands synced LRC ("[01:23.45] line", several stamps per
// line allowed) and falls back to plain text with no timing.

const STAMP = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g
const WORD_STAMP = /<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g
const META_TAG = /^\s*\[[a-zA-Z]+:[^\]]*\]\s*$/

function stampToSeconds(min, sec, frac) {
  const fraction = frac ? Number(`0.${frac}`) : 0
  return Number(min) * 60 + Number(sec) + fraction
}

export function parseLyrics(text) {
  if (!text || !text.trim()) return { synced: false, lines: [] }
  const rawLines = text.replace(/\r/g, '').split('\n')

  const timed = []
  for (const raw of rawLines) {
    if (META_TAG.test(raw)) continue
    const stamps = [...raw.matchAll(STAMP)]
    if (!stamps.length) continue
    const lineText = raw.replace(STAMP, '').replace(WORD_STAMP, '').trim()
    for (const [, m, s, f] of stamps) timed.push({ time: stampToSeconds(m, s, f), text: lineText })
  }

  if (timed.length) {
    timed.sort((a, b) => a.time - b.time)
    return { synced: true, lines: timed }
  }

  const lines = []
  for (const raw of rawLines) {
    if (META_TAG.test(raw)) continue
    const line = raw.trim()
    if (!line && (!lines.length || lines[lines.length - 1].text === '')) continue // collapse blank runs
    lines.push({ time: null, text: line })
  }
  while (lines.length && lines[lines.length - 1].text === '') lines.pop()
  return { synced: false, lines }
}

/** Index of the line being sung at `time` (seconds), or -1 before the first line. */
export function activeLineIndex(lines, time, lookahead = 0.2) {
  const t = time + lookahead
  let lo = 0
  let hi = lines.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].time <= t) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}
