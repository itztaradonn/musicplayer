import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { config } from '../src/config.js'
import { checkinCookies, checkoutCookies, cookiesFileIfAny, cookiesStatus, parseCookies, removeCookies, saveCookies } from '../src/cookies.js'
import { UserError } from '../src/errors.js'
import { friendlyYtDlpError } from '../src/youtube.js'

const T = '\t'
const line = (domain, name, value, expiry = 1893456000, secure = 'TRUE') => [domain, 'TRUE', '/', secure, expiry, name, value].join(T)
const FILE = ['# Netscape HTTP Cookie File', '# comment line',
  line('.youtube.com', 'LOGIN_INFO', 'abc123'),
  line('#HttpOnly_.youtube.com', '__Secure-3PSID', 'sid-secret-value'),
  line('.google.com', 'SAPISID', 'xyz', 1900000000),
  line('.bank.example.com', 'session', 'BANK-SECRET'),
  line('.facebook.com', 'c_user', 'FB-SECRET'),
  '',
].join('\n')

test('keeps only youtube.com and google.com cookies and drops everything else', () => {
  const r = parseCookies(FILE)
  assert.equal(r.count, 3)
  assert.equal(r.dropped, 2)
  assert.equal(r.loggedIn, true)
  assert.doesNotMatch(r.text, /BANK-SECRET|FB-SECRET|bank\.example|facebook/)
  assert.match(r.text, /sid-secret-value/)
  assert.match(r.text, /^# Netscape HTTP Cookie File\n/)
  assert.match(r.text, /#HttpOnly_\.youtube\.com/) // HttpOnly marker preserved so yt-dlp still reads it
})

test('does not keep look-alike domains', () => {
  const evil = [line('.notyoutube.com', 'a', '1'), line('.youtube.com.evil.io', 'b', '2'), line('.evilgoogle.com', 'c', '3')].join('\n')
  assert.throws(() => parseCookies(evil), /No youtube\.com or google\.com cookies/)
})

test('reports the soonest expiry and ignores session cookies for it', () => {
  const r = parseCookies([line('.youtube.com', 'a', '1', 0), line('.youtube.com', 'b', '2', 1893456000), line('.google.com', 'c', '3', 1800000000)].join('\n'))
  assert.equal(r.earliestExpiry, new Date(1800000000 * 1000).toISOString())
})

test('flags cookies that are not logged-in cookies', () => {
  assert.equal(parseCookies(line('.youtube.com', 'VISITOR_INFO1_LIVE', 'x')).loggedIn, false)
})

test('tolerates tabs that a paste turned into spaces, and CRLF', () => {
  const spaced = FILE.replaceAll(T, '    ').replaceAll('\n', '\r\n')
  assert.equal(parseCookies(spaced).count, 3)
})

test('accepts a raw Cookie header and files it under youtube.com', () => {
  const r = parseCookies('Cookie: SID=aaa; __Secure-3PAPISID=bbb/ccc=; LOGIN_INFO=ddd')
  assert.equal(r.count, 3)
  assert.equal(r.loggedIn, true)
  assert.match(r.text, /\.youtube\.com\tTRUE\t\/\tTRUE\t\d+\tSID\taaa/)
  assert.match(r.text, /__Secure-3PAPISID\tbbb\/ccc=/)
})

test('a later duplicate cookie replaces the earlier one', () => {
  const r = parseCookies([line('.youtube.com', 'SID', 'old'), line('.youtube.com', 'SID', 'new')].join('\n'))
  assert.equal(r.count, 1)
  assert.match(r.text, /new/)
  assert.doesNotMatch(r.text, /old/)
})

test('rejects empty, garbage, oversized and non-string input with helpful messages', () => {
  for (const bad of ['', '   \n ', null, undefined]) assert.throws(() => parseCookies(bad), UserError)
  assert.throws(() => parseCookies('hello world this is not cookies'), /Couldn't read any cookies/)
  assert.throws(() => parseCookies('a'.repeat(600 * 1024)), /too large/)
})

test('cannot smuggle extra lines or fields into the saved file', () => {
  // a header-style value containing a newline must not become a second Netscape line
  assert.throws(() => parseCookies('SID=abc\n.evil.com\tTRUE\t/\tTRUE\t0\tx\ty'), UserError)
  // control characters in a Netscape field invalidate that line
  const poisoned = [line('.youtube.com', 'good', 'ok'), `.youtube.com${T}TRUE${T}/${T}TRUE${T}0${T}bad\u0000name${T}v`].join('\n')
  assert.equal(parseCookies(poisoned).count, 1)
  // header values cannot contain whitespace/semicolons/control chars
  assert.throws(() => parseCookies('SID=a b'), UserError)
})

test('error messages never contain cookie values', () => {
  for (const bad of [`SID=super-secret-token-123 bad value`, 'x'.repeat(600 * 1024)]) {
    try { parseCookies(bad); assert.fail('should throw') } catch (e) { assert.doesNotMatch(e.message, /super-secret|xxxx/) }
  }
})

// ---- storage
let dir, original
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cookies-test-'))
  original = config.cookiesPath
  config.cookiesPath = path.join(dir, 'nested', 'cookies.txt')
})
after(() => {
  config.cookiesPath = original
  fs.rmSync(dir, { recursive: true, force: true })
})

test('save writes a private file, status reports counts only, remove deletes it', async () => {
  assert.deepEqual(await cookiesStatus(), { configured: false })
  assert.equal(await cookiesFileIfAny(), null)

  const saved = await saveCookies(FILE)
  assert.equal(saved.count, 3)
  assert.equal(JSON.stringify(saved).includes('sid-secret-value'), false, 'save result leaks a cookie value')

  const mode = fs.statSync(config.cookiesPath).mode & 0o777
  assert.equal(mode, 0o600, `cookie file mode is ${mode.toString(8)}`)
  assert.equal(await cookiesFileIfAny(), config.cookiesPath)
  assert.deepEqual(fs.readdirSync(path.dirname(config.cookiesPath)), ['cookies.txt'], 'temp file left behind')

  const status = await cookiesStatus()
  assert.equal(status.configured, true)
  assert.equal(status.count, 3)
  assert.equal(JSON.stringify(status).includes('sid-secret-value'), false, 'status leaks a cookie value')

  await removeCookies()
  assert.deepEqual(await cookiesStatus(), { configured: false })
  await removeCookies() // removing twice is fine
})

test('a corrupt saved file is reported as unusable, not as cookies', async () => {
  fs.mkdirSync(path.dirname(config.cookiesPath), { recursive: true })
  fs.writeFileSync(config.cookiesPath, 'garbage')
  const status = await cookiesStatus()
  assert.equal(status.configured, false)
  assert.match(status.problem, /Save your cookies again/)
  await removeCookies()
})

test('yt-dlp errors point at the in-app cookie screen, and say so when cookies were already used', () => {
  const bot = "ERROR: Sign in to confirm you're not a bot"
  assert.match(friendlyYtDlpError(bot), /YouTube cookies/)
  assert.match(friendlyYtDlpError(bot, null, { usedCookies: true }), /expired or been rotated/)
})

// ---- yt-dlp rewrites the cookie file it is given, so imports work on a private copy
const jar = (...extra) => ['# Netscape HTTP Cookie File', '# This file is generated by yt-dlp.  Do not edit.', '', line('.youtube.com', 'LOGIN_INFO', 'old'), ...extra].join('\n') + '\n'

test('checkout copies the saved cookies into the job folder, privately, and returns null when none are saved', async () => {
  await removeCookies()
  assert.equal(await checkoutCookies(dir), null)
  await saveCookies(FILE)
  const handle = await checkoutCookies(dir)
  assert.notEqual(handle.path, config.cookiesPath)
  assert.equal(fs.statSync(handle.path).mode & 0o777, 0o600)
  assert.equal(fs.readFileSync(handle.path, 'utf8'), fs.readFileSync(config.cookiesPath, 'utf8'))
  await removeCookies()
})

test('the saved file is untouched while a download rewrites its copy', async () => {
  await saveCookies(FILE)
  const before = fs.readFileSync(config.cookiesPath, 'utf8')
  const handle = await checkoutCookies(dir)
  fs.writeFileSync(handle.path, 'yt-dlp scribbled over this copy')
  assert.equal(fs.readFileSync(config.cookiesPath, 'utf8'), before)
  await removeCookies()
})

test('checkin keeps cookies YouTube refreshed, and still filters out other sites', async () => {
  await saveCookies(FILE)
  const handle = await checkoutCookies(dir)
  fs.writeFileSync(handle.path, jar(line('.youtube.com', 'PREF', 'refreshed-value'), line('.evil.example.com', 'x', 'EVIL-SECRET')))
  await checkinCookies(handle)
  const saved = fs.readFileSync(config.cookiesPath, 'utf8')
  assert.match(saved, /refreshed-value/)
  assert.doesNotMatch(saved, /EVIL-SECRET|evil\.example/)
  assert.equal(fs.statSync(config.cookiesPath).mode & 0o777, 0o600)
  await removeCookies()
})

test('removing cookies during a download is not undone when it finishes', async () => {
  await saveCookies(FILE)
  const handle = await checkoutCookies(dir)
  await removeCookies() // user clicks remove while the import runs
  fs.writeFileSync(handle.path, jar())
  await checkinCookies(handle)
  assert.equal(await cookiesFileIfAny(), null, 'removed cookies came back')
})

test('saving new cookies during a download is not overwritten when it finishes', async () => {
  await saveCookies(FILE)
  const handle = await checkoutCookies(dir)
  await saveCookies(line('.youtube.com', 'LOGIN_INFO', 'brand-new')) // user pastes fresh cookies mid-import
  fs.writeFileSync(handle.path, jar())
  await checkinCookies(handle)
  const saved = fs.readFileSync(config.cookiesPath, 'utf8')
  assert.match(saved, /brand-new/)
  assert.doesNotMatch(saved, /\told\b/)
  await removeCookies()
})

test('checkin never throws, even for a missing or garbage copy', async () => {
  await checkinCookies(null)
  await saveCookies(FILE)
  const handle = await checkoutCookies(dir)
  fs.rmSync(handle.path)
  await checkinCookies(handle)
  const handle2 = await checkoutCookies(dir)
  fs.writeFileSync(handle2.path, 'garbage')
  await checkinCookies(handle2)
  assert.equal((await cookiesStatus()).count, 3, 'valid saved cookies were damaged')
  await removeCookies()
})
