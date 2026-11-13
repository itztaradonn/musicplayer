const NOISE = /official|video|audio|lyrics?|visuali[sz]er|hd|4k|remaster(ed)?|music video|mv|m\/v/i

/** Removes "(Official Video)", "[Lyrics]" and similar clutter from a video title. */
export function cleanTitle(title = '') {
  let t = title
  t = t.replace(/[([{][^()[\]{}]*[)\]}]/g, (group) => (NOISE.test(group) ? '' : group))
  t = t.replace(/\s*[|｜]\s*(official.*|lyrics?.*|audio.*)$/i, '')
  return t.replace(/\s{2,}/g, ' ').replace(/[\s\-–—|]+$/, '').trim()
}

export function cleanArtist(name = '') {
  return name.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim()
}

/** Turns a yt-dlp info object into { title, artist, duration } for the library. */
export function deriveMetadata(info) {
  let title = info.track ? info.track.trim() : cleanTitle(info.title || 'Untitled')
  let artist = cleanArtist(
    (Array.isArray(info.artists) && info.artists[0]) || info.artist || info.creator || '',
  )

  if (!info.track) {
    const m = title.match(/^(.+?)\s+[-–—]\s+(.+)$/)
    if (m) {
      if (!artist) artist = cleanArtist(m[1])
      title = m[2].trim()
    }
  }
  if (!artist) artist = cleanArtist(info.channel || info.uploader || '')

  return {
    title: title || 'Untitled',
    artist: artist || null,
    duration: Number.isFinite(info.duration) ? Math.round(info.duration) : null,
  }
}
