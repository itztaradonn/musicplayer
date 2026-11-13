import crypto from 'node:crypto'
import cors from 'cors'
import express from 'express'
import { config, missingConfig } from './config.js'
import { cookiesStatus, removeCookies, saveCookies, seedCookiesFromEnv } from './cookies.js'
import { createJob, enqueue, getJob } from './jobs.js'
import { generateLyrics, importYoutube } from './pipeline.js'
import { mountStatic } from './static.js'
import { getTrack, updateTrack } from './storage.js'
import { lyricsEnabled } from './transcribe.js'
import { UserError } from './errors.js'
import { parseYoutubeUrl } from './youtube.js'

const missing = missingConfig()
if (missing.length) {
  console.error(`Missing configuration:\n - ${missing.join('\n - ')}`)
  process.exit(1)
}

const app = express()
app.disable('x-powered-by')
app.use(
  cors({
    origin: config.allowedOrigins.length ? config.allowedOrigins : true,
    allowedHeaders: ['Authorization', 'Content-Type'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  }),
)
app.use(express.json({ limit: '1mb' }))
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store') // job polls must never be cached
  next()
})

app.get('/api/health', (req, res) => res.json({ ok: true, lyrics: lyricsEnabled() }))

const tokenBuf = Buffer.from(config.apiToken)
app.use('/api', (req, res, next) => {
  const given = Buffer.from((req.get('authorization') || '').replace(/^Bearer\s+/i, ''))
  const ok = given.length === tokenBuf.length && crypto.timingSafeEqual(given, tokenBuf)
  if (!ok) return res.status(401).json({ error: 'Wrong or missing access token.' })
  next()
})

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res)
  } catch (err) {
    const status = err instanceof UserError ? 400 : 500
    if (status === 500) console.error(err)
    res.status(status).json({ error: err.message || 'Server error' })
  }
}

const publicJob = (j) => ({ id: j.id, status: j.status, stage: j.stage, error: j.error, warning: j.warning, track: j.track })

app.post('/api/import', wrap(async (req, res) => {
  const { url, autoLyrics = true, language } = req.body || {}
  parseYoutubeUrl(url) // reject bad links immediately instead of after queueing
  const job = createJob('import')
  enqueue(job, (j) => importYoutube(j, { url, autoLyrics: Boolean(autoLyrics), language: language || undefined }))
  res.status(202).json(publicJob(job))
}))

app.post('/api/tracks/:id/generate-lyrics', wrap(async (req, res) => {
  const { language } = req.body || {}
  await getTrack(req.params.id) // 404-style error before queueing
  const job = createJob('lyrics')
  enqueue(job, (j) => generateLyrics(j, { trackId: req.params.id, language: language || undefined }))
  res.status(202).json(publicJob(job))
}))

app.put('/api/tracks/:id/lyrics', wrap(async (req, res) => {
  const { lyrics } = req.body || {}
  if (lyrics != null && typeof lyrics !== 'string') throw new UserError('Lyrics must be text.')
  if (lyrics && lyrics.length > 200_000) throw new UserError('Lyrics are too long.')
  const text = lyrics && lyrics.trim() ? lyrics : null
  const track = await updateTrack(req.params.id, { lyrics: text, lyrics_source: text ? 'manual' : null })
  res.json({ track })
}))

// YouTube cookies (secret). Status only ever reports counts, never the cookie values.
app.get('/api/cookies', wrap(async (req, res) => res.json(await cookiesStatus())))
app.put('/api/cookies', wrap(async (req, res) => {
  const { cookies } = req.body || {}
  if (typeof cookies !== 'string') throw new UserError('Paste your cookies first.')
  res.json(await saveCookies(cookies))
}))
app.delete('/api/cookies', wrap(async (req, res) => {
  await removeCookies()
  res.json({ configured: false })
}))

app.get('/api/jobs/:id', (req, res) => {
  const job = getJob(req.params.id)
  if (!job) return res.status(404).json({ error: 'Unknown job (the server may have restarted).' })
  res.json(publicJob(job))
})

if (config.staticDir) mountStatic(app, config.staticDir)

// Last stop for errors thrown outside the route handlers (e.g. an oversized or malformed body).
// Never echo the request body back: it may contain cookies.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500
  res.status(status).json({ error: status === 413 ? 'That is too large.' : status < 500 ? 'Bad request.' : 'Server error.' })
})

await seedCookiesFromEnv()

app.listen(config.port, () => {
  console.log(`Listening on :${config.port}${config.staticDir ? ` (serving the site from ${config.staticDir})` : ' (API only)'}`)
})
