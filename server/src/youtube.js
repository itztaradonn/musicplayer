import { spawn } from 'node:child_process'
import path from 'node:path'
import { config } from './config.js'
import { cookiesFileIfAny } from './cookies.js'
import { UserError } from './errors.js'

const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be'])
const ID_RE = /^[\w-]{11}$/

export { UserError }

/** Accepts any common YouTube link and returns a clean single-video watch URL + id. */
export function parseYoutubeUrl(input) {
  let url
  try {
    url = new URL(String(input || '').trim())
  } catch {
    throw new UserError('That does not look like a link.')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new UserError('That does not look like a YouTube link.')
  if (!HOSTS.has(url.hostname.toLowerCase())) throw new UserError('Only YouTube links are supported.')

  let id = ''
  if (url.hostname.toLowerCase().endsWith('youtu.be')) {
    id = url.pathname.split('/')[1] || ''
  } else if (url.pathname === '/watch') {
    id = url.searchParams.get('v') || ''
  } else {
    const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/]+)/)
    id = m ? m[1] : ''
  }
  if (!ID_RE.test(id)) throw new UserError('Could not find a video in that link.')
  return { id, url: `https://www.youtube.com/watch?v=${id}` }
}

export function run(cmd, args, { timeoutMs = 10 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    // No shell: arguments are passed as an array so a link can never inject a command.
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-8000) })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err.code === 'ENOENT' ? new Error(`${cmd} is not installed on the server`) : err)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve({ stdout, stderr })
      else {
        const last = stderr.trim().split('\n').filter(Boolean).pop() || `exit code ${code}`
        reject(Object.assign(new Error(`${path.basename(cmd)} failed: ${last.slice(0, 200)}`), { stderr, signal }))
      }
    })
  })
}

export function friendlyYtDlpError(stderr = '', signal = null, { usedCookies = false } = {}) {
  if (signal === 'SIGKILL') return 'The download took too long and was cancelled.'
  if (/sign in to confirm|not a bot/i.test(stderr))
    return usedCookies
      ? 'YouTube still blocked the server even with your saved cookies. They have probably expired or been rotated. Export fresh cookies and save them again under YouTube cookies.'
      : 'YouTube blocked the server ("confirm you\'re not a bot"). Add your YouTube cookies in the app (Add from YouTube, then YouTube cookies).'
  if (/private video|members-only|sign in to confirm your age|age-restricted/i.test(stderr))
    return 'That video is private, age-restricted or members-only. Saving your YouTube cookies (Add from YouTube, then YouTube cookies) may help.'
  if (/video unavailable|has been removed|not available/i.test(stderr)) return 'That video is unavailable.'
  if (/HTTP Error 429|too many requests/i.test(stderr)) return 'YouTube is rate-limiting the server. Try again later.'
  const last = stderr.trim().split('\n').filter(Boolean).pop()
  return `Download failed${last ? `: ${last.slice(0, 200)}` : '.'}`
}

async function baseArgs() {
  const args = ['--no-playlist', '--no-warnings', '--no-progress', ...config.ytDlpExtraArgs]
  const cookies = await cookiesFileIfAny()
  if (cookies) args.push('--cookies', cookies)
  return args
}

/** Runs yt-dlp and turns its failures into messages a person can act on. */
async function runYtDlp(args, options) {
  try {
    return await run(config.ytDlpPath, args, options)
  } catch (err) {
    if (err.stderr === undefined) throw err // e.g. yt-dlp not installed
    throw new Error(friendlyYtDlpError(err.stderr, err.signal, { usedCookies: args.includes('--cookies') }))
  }
}

export async function fetchInfo(url) {
  const args = [...(await baseArgs()), '--skip-download', '--dump-single-json', '--', url]
  const { stdout } = await runYtDlp(args, { timeoutMs: 2 * 60 * 1000 })
  return JSON.parse(stdout)
}

/** Downloads audio as MP3 (and the thumbnail as JPG) into `dir`. */
export async function downloadAudio(url, dir) {
  const args = [
    ...(await baseArgs()),
    '-f', 'bestaudio/best',
    '-x', '--audio-format', 'mp3', '--audio-quality', '192K',
    '--write-thumbnail', '--convert-thumbnails', 'jpg',
    '-o', path.join(dir, 'audio.%(ext)s'),
    '--', url,
  ]
  await runYtDlp(args)
  return { audioPath: path.join(dir, 'audio.mp3'), thumbPath: path.join(dir, 'audio.jpg') }
}

