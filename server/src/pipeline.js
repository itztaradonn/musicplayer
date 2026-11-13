import crypto from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { config } from './config.js'
import { checkinCookies, checkoutCookies } from './cookies.js'
import { update } from './jobs.js'
import { deriveMetadata } from './metadata.js'
import { downloadObject, getTrack, insertTrack, removeObjects, updateTrack, uploadObject } from './storage.js'
import { lyricsEnabled, transcribeToLrc } from './transcribe.js'
import { UserError, downloadAudio, fetchInfo, parseYoutubeUrl, run } from './youtube.js'

const tmp = () => mkdtemp(path.join(os.tmpdir(), 'musicplayer-'))
const objectName = (ext, folder = '') => `${folder}${Date.now()}_${crypto.randomUUID()}.${ext}`

/** Square 640px JPG cover from a (usually 16:9) video thumbnail. */
async function makeCover(thumbPath, dir) {
  const out = path.join(dir, 'cover.jpg')
  await run('ffmpeg', ['-y', '-i', thumbPath, '-vf', "crop='min(iw,ih)':'min(iw,ih)',scale='min(640,iw)':-2", '-q:v', '3', out], { timeoutMs: 60_000 })
  return readFile(out)
}

export async function importYoutube(job, { url, autoLyrics = true, language }) {
  const { url: cleanUrl } = parseYoutubeUrl(url)
  const dir = await tmp()
  const uploaded = []
  let cookies = null
  try {
    cookies = await checkoutCookies(dir) // private copy: yt-dlp rewrites the cookie file it is given
    update(job, { stage: 'downloading' })
    const info = await fetchInfo(cleanUrl, cookies?.path)
    if (info.is_live) throw new UserError('Live streams cannot be imported.')
    if (info.duration && info.duration > config.maxDurationSec)
      throw new UserError(`That video is longer than the ${Math.round(config.maxDurationSec / 60)} minute limit.`)
    const meta = deriveMetadata(info)

    const { audioPath, thumbPath } = await downloadAudio(cleanUrl, dir, cookies?.path)

    update(job, { stage: 'saving' })
    const filePath = objectName('mp3')
    await uploadObject(filePath, await readFile(audioPath), 'audio/mpeg')
    uploaded.push(filePath)

    let artworkPath = null
    try {
      const cover = await makeCover(thumbPath, dir)
      artworkPath = objectName('jpg', 'covers/')
      await uploadObject(artworkPath, cover, 'image/jpeg')
      uploaded.push(artworkPath)
    } catch (err) {
      console.warn('cover skipped:', err.message) // a missing cover should never fail the import
      artworkPath = null
    }

    let track
    try {
      track = await insertTrack({
        name: meta.title,
        file_path: filePath,
        artist: meta.artist,
        artwork_path: artworkPath,
        duration: meta.duration,
        source_url: cleanUrl,
      })
    } catch (err) {
      await removeObjects(uploaded) // don't leave orphaned files behind
      throw err
    }
    update(job, { track }) // the song is safe in the library from here on

    if (autoLyrics) {
      if (!lyricsEnabled()) {
        update(job, { warning: 'Automatic lyrics are not set up on the server, so none were generated.' })
      } else {
        update(job, { stage: 'transcribing' })
        try {
          const lrc = await transcribeToLrc(audioPath, dir, { language })
          update(job, {
            track: lrc ? await updateTrack(track.id, { lyrics: lrc, lyrics_source: 'auto' }) : track,
            warning: lrc ? null : 'No singing was detected, so there are no lyrics. You can add them yourself.',
          })
        } catch (err) {
          update(job, { warning: `Song added, but lyrics failed: ${err.message}` })
        }
      }
    }
  } finally {
    await checkinCookies(cookies)
    await rm(dir, { recursive: true, force: true })
  }
}

export async function generateLyrics(job, { trackId, language }) {
  const track = await getTrack(trackId)
  const dir = await tmp()
  try {
    update(job, { stage: 'transcribing', track })
    const audioPath = path.join(dir, 'source.mp3')
    await writeFile(audioPath, await downloadObject(track.file_path))
    const lrc = await transcribeToLrc(audioPath, dir, { language })
    if (!lrc) {
      update(job, { warning: 'No singing was detected, so no lyrics were generated.' })
      return
    }
    update(job, { track: await updateTrack(track.id, { lyrics: lrc, lyrics_source: 'auto' }) })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
