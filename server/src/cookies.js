import crypto from 'node:crypto'
import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { config } from './config.js'
import { UserError } from './errors.js'

// YouTube cookies are as sensitive as a password to the Google account. Rules for this module:
//  - keep ONLY youtube.com / google.com cookies, discard everything else the user pasted
//  - store them in one private file (mode 0600) on the server, never in the website or database
//  - never log them and never send their contents back to anyone (status only reports counts)

const KEEP_DOMAINS = ['youtube.com', 'google.com']
const AUTH_NAMES = new Set(['SID', 'SAPISID', '__Secure-1PSID', '__Secure-3PSID', '__Secure-1PAPISID', '__Secure-3PAPISID', 'LOGIN_INFO'])
export const MAX_COOKIE_TEXT = 512 * 1024

const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
// Control characters are rejected on purpose, so nothing pasted can add lines or fields to the saved file.
/* eslint-disable no-control-regex */
const HEADER_VALUE = /^[^\s;\u0000-\u001f\u007f]*$/
const FIELD_OK = /^[^\u0000-\u001f\u007f]*$/
/* eslint-enable no-control-regex */

const bareDomain = (domain) => domain.replace(/^#HttpOnly_/, '').replace(/^\./, '').toLowerCase()
const isKeptDomain = (domain) => {
  const d = bareDomain(domain)
  return KEEP_DOMAINS.some((k) => d === k || d.endsWith(`.${k}`))
}

/** One line of a Netscape cookies.txt. Also tolerates tabs that a paste turned into spaces. */
function parseNetscapeLine(raw) {
  const line = raw.replace(/\r$/, '')
  if (!line.trim()) return null
  if (line.startsWith('#') && !line.startsWith('#HttpOnly_')) return null // comment / header

  let parts = line.split('\t')
  if (parts.length < 7) {
    const words = line.trim().split(/\s+/)
    if (words.length < 7) return null
    parts = [...words.slice(0, 6), words.slice(6).join(' ')]
  } else if (parts.length > 7) {
    parts = [...parts.slice(0, 6), parts.slice(6).join('\t')]
  }
  const [domain, includeSub, cookiePath, secure, expiry, name, value] = parts
  if (!domain || !/^(TRUE|FALSE)$/i.test(includeSub) || !cookiePath.startsWith('/')) return null
  if (!/^(TRUE|FALSE)$/i.test(secure) || !/^\d+$/.test(expiry) || !name) return null
  if (![domain, cookiePath, name, value].every((f) => FIELD_OK.test(f))) return null
  return { domain, includeSub: includeSub.toUpperCase(), path: cookiePath, secure: secure.toUpperCase(), expiry: Number(expiry), name, value }
}

/** "name=value; name2=value2" as copied from a browser request's Cookie header. */
function parseCookieHeader(text) {
  const body = text.trim().replace(/^cookie:\s*/i, '')
  if (!body || body.includes('\n')) return []
  const expiry = Math.floor(Date.now() / 1000) + 365 * 24 * 3600
  const cookies = []
  for (const pair of body.split(';')) {
    const trimmed = pair.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) return []
    const name = trimmed.slice(0, eq)
    const value = trimmed.slice(eq + 1)
    if (!HEADER_NAME.test(name) || !HEADER_VALUE.test(value)) return []
    cookies.push({ domain: '.youtube.com', includeSub: 'TRUE', path: '/', secure: 'TRUE', expiry, name, value })
  }
  return cookies
}

/**
 * Reads pasted cookies (Netscape cookies.txt or a Cookie header) and returns what is safe to keep.
 * Throws UserError with a helpful message when nothing usable is found.
 */
export function parseCookies(input) {
  const text = String(input ?? '')
  if (text.length > MAX_COOKIE_TEXT) throw new UserError('That is too large to be a cookie export (limit 512 KB).')
  if (!text.trim()) throw new UserError('Paste your cookies first.')

  let cookies = text.split('\n').map(parseNetscapeLine).filter(Boolean)
  if (!cookies.length) cookies = parseCookieHeader(text)
  if (!cookies.length) {
    throw new UserError(
      "Couldn't read any cookies from that. Paste the contents of a cookies.txt export (Netscape format), or a Cookie header like name=value; name2=value2.",
    )
  }

  const kept = [...new Map(cookies.filter((c) => isKeptDomain(c.domain)).map((c) => [`${bareDomain(c.domain)}|${c.path}|${c.name}`, c])).values()]
  if (!kept.length) throw new UserError('No youtube.com or google.com cookies found in that. Export the cookies while on youtube.com.')

  const expiries = kept.map((c) => c.expiry).filter((e) => e > 0)
  return {
    text: `# Netscape HTTP Cookie File\n${kept.map((c) => [c.domain, c.includeSub, c.path, c.secure, c.expiry, c.name, c.value].join('\t')).join('\n')}\n`,
    count: kept.length,
    dropped: cookies.length - kept.length,
    loggedIn: kept.some((c) => AUTH_NAMES.has(c.name)),
    earliestExpiry: expiries.length ? new Date(Math.min(...expiries) * 1000).toISOString() : null,
  }
}

const publicSummary = ({ count, dropped, loggedIn, earliestExpiry }) => ({ configured: true, count, dropped, loggedIn, earliestExpiry })

async function writeAtomic(text) {
  const file = config.cookiesPath
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, text, { mode: 0o600 })
  await rename(tmp, file) // atomic: a download never sees a half-written file
}

export async function saveCookies(input) {
  const parsed = parseCookies(input)
  await writeAtomic(parsed.text)
  return { ...publicSummary(parsed), updatedAt: new Date().toISOString() }
}

const sha = (text) => crypto.createHash('sha256').update(text).digest('hex')

/**
 * yt-dlp writes its cookie jar back to the file it is given when it exits. So each import works on a
 * private copy in its own temp folder (returns null when no cookies are saved), and the saved file is
 * never touched while a download runs.
 */
export async function checkoutCookies(dir) {
  let text
  try {
    text = await readFile(config.cookiesPath, 'utf8')
  } catch {
    return null
  }
  const copy = path.join(dir, 'cookies.txt')
  await writeFile(copy, text, { mode: 0o600 })
  return { path: copy, original: sha(text) }
}

/**
 * After the import, keep the cookies YouTube refreshed during it (they rotate, and this extends their
 * life), but only if nothing changed meanwhile. If you saved new cookies or removed them while the
 * download ran, your action wins: removed cookies are never brought back and new ones never overwritten.
 * Anything merged back goes through the same filtering as a paste.
 */
export async function checkinCookies(handle) {
  if (!handle) return
  try {
    const [refreshed, current] = await Promise.all([readFile(handle.path, 'utf8'), readFile(config.cookiesPath, 'utf8')])
    if (sha(current) !== handle.original) return // changed or removed during the job: leave it alone
    const parsed = parseCookies(refreshed)
    if (parsed.text !== current) await writeAtomic(parsed.text)
  } catch {
    // saved file removed meanwhile, copy unreadable or no longer valid: keep whatever is saved
  }
}

/** Counts only; the cookie values never leave this file. */
export async function cookiesStatus() {
  try {
    const [text, info] = await Promise.all([readFile(config.cookiesPath, 'utf8'), stat(config.cookiesPath)])
    return { ...publicSummary(parseCookies(text)), updatedAt: info.mtime.toISOString() }
  } catch (err) {
    if (err.code === 'ENOENT') return { configured: false }
    return { configured: false, problem: 'The saved cookie file could not be read. Save your cookies again.' }
  }
}

export async function removeCookies() {
  await rm(config.cookiesPath, { force: true })
}

export async function cookiesFileIfAny() {
  try {
    await access(config.cookiesPath)
    return config.cookiesPath
  } catch {
    return null
  }
}

/** Lets the older YT_COOKIES_B64 environment variable seed the file once, if nothing is saved yet. */
export async function seedCookiesFromEnv() {
  if (!config.cookiesB64 || (await cookiesFileIfAny())) return
  try {
    await saveCookies(Buffer.from(config.cookiesB64, 'base64').toString('utf8'))
  } catch (err) {
    console.warn(`YT_COOKIES_B64 ignored: ${err.message}`)
  }
}
