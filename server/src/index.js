import crypto from 'node:crypto'
import cors from 'cors'
import express from 'express'
import { config, missingConfig } from './config.js'
import { createJob, enqueue, getJob } from './jobs.js'
import { generateLyrics, importYoutube } from './pipeline.js'
import { getTrack, updateTrack } from './storage.js'
import { lyricsEnabled } from './transcribe.js'
import { UserError, parseYoutubeUrl } from './youtube.js'

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
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
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

app.get('/api/jobs/:id', (req, res) => {
  const job = getJob(req.params.id)
  if (!job) return res.status(404).json({ error: 'Unknown job (the server may have restarted).' })
  res.json(publicJob(job))
})

app.listen(config.port, () => console.log(`Import server listening on :${config.port}`))
