import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { config } from './config.js'

const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be'])
const ID_RE = /^[\w-]{11}$/

export class UserError extends Error {}

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

let cookiesPath = null
async function getCookiesPath() {
  if (!config.cookiesB64) return null
  if (cookiesPath) return cookiesPath
  const dir = path.join(os.tmpdir(), 'musicplayer-cookies')
  await mkdir(dir, { recursive: true })
  cookiesPath = path.join(dir, 'cookies.txt')
  await writeFile(cookiesPath, Buffer.from(config.cookiesB64, 'base64'), { mode: 0o600 })
  return cookiesPath
}

function run(cmd, args, { timeoutMs = 10 * 60 * 1000 } = {}) {
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
      else reject(Object.assign(new Error(friendlyYtDlpError(stderr, signal)), { stderr }))
    })
  })
}

export function friendlyYtDlpError(stderr = '', signal = null) {
  if (signal === 'SIGKILL') return 'The download took too long and was cancelled.'
  if (/sign in to confirm|not a bot/i.test(stderr))
    return 'YouTube blocked the server ("confirm you\'re not a bot"). Add YouTube cookies to the server (see server/README.md).'
  if (/private video|members-only|sign in to confirm your age|age-restricted/i.test(stderr))
    return 'That video is private, age-restricted or members-only. Cookies from a logged-in account may help.'
  if (/video unavailable|has been removed|not available/i.test(stderr)) return 'That video is unavailable.'
  if (/HTTP Error 429|too many requests/i.test(stderr)) return 'YouTube is rate-limiting the server. Try again later.'
  const last = stderr.trim().split('\n').filter(Boolean).pop()
  return `Download failed${last ? `: ${last.slice(0, 200)}` : '.'}`
}

async function baseArgs() {
  const args = ['--no-playlist', '--no-warnings', '--no-progress', ...config.ytDlpExtraArgs]
  const cookies = await getCookiesPath()
  if (cookies) args.push('--cookies', cookies)
  return args
}

export async function fetchInfo(url) {
  const args = [...(await baseArgs()), '--skip-download', '--dump-single-json', '--', url]
  const { stdout } = await run(config.ytDlpPath, args, { timeoutMs: 2 * 60 * 1000 })
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
  await run(config.ytDlpPath, args)
  return { audioPath: path.join(dir, 'audio.mp3'), thumbPath: path.join(dir, 'audio.jpg') }
}

export { run }
