import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { config } from './config.js'
import { run } from './youtube.js'
import { segmentsToLrc } from './lrc.js'

const MAX_UPLOAD_BYTES = 24 * 1024 * 1024 // Whisper APIs reject larger uploads

export function lyricsEnabled() {
  return Boolean(config.whisperKey)
}

/** Shrinks audio to a small mono 16 kHz MP3, which is all speech-to-text needs. */
export async function downsample(inputPath, dir) {
  const out = path.join(dir, 'speech.mp3')
  await run('ffmpeg', ['-y', '-i', inputPath, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', out], {
    timeoutMs: 5 * 60 * 1000,
  })
  return out
}

/** Sends audio to the Whisper API and returns synced lyrics in LRC format ('' if nothing was sung). */
export async function transcribeToLrc(audioPath, dir, { language } = {}) {
  if (!lyricsEnabled()) throw new Error('Automatic lyrics are not configured (set WHISPER_API_KEY on the server).')

  const small = await downsample(audioPath, dir)
  const bytes = await readFile(small)
  if (bytes.length > MAX_UPLOAD_BYTES) throw new Error('This track is too long to transcribe automatically.')

  const form = new FormData()
  form.append('file', new Blob([bytes], { type: 'audio/mpeg' }), 'audio.mp3')
  form.append('model', config.whisperModel)
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'segment')
  form.append('temperature', '0')
  if (language) form.append('language', language)

  const res = await fetch(config.whisperUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.whisperKey}` },
    body: form,
    signal: AbortSignal.timeout(5 * 60 * 1000),
  })
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200)
    throw new Error(`Speech-to-text failed (${res.status}). ${detail}`)
  }
  const json = await res.json()
  return segmentsToLrc(json.segments || [])
}
