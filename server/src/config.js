import os from 'node:os'
import path from 'node:path'

const env = process.env

const list = (value) =>
  (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

export const config = {
  port: Number(env.PORT) || 8787,
  // Folder with the built website (npm run build -> dist). When set, this server serves the site too.
  staticDir: env.STATIC_DIR || '',
  apiToken: env.API_TOKEN || '',
  allowedOrigins: list(env.ALLOWED_ORIGINS),

  supabaseUrl: env.SUPABASE_URL || '',
  supabaseServiceKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
  bucket: env.SUPABASE_BUCKET || 'music',

  // Speech-to-text. Defaults to Groq's hosted Whisper; any OpenAI-compatible
  // /audio/transcriptions endpoint works (e.g. https://api.openai.com/v1/audio/transcriptions + whisper-1).
  whisperUrl: env.WHISPER_API_URL || 'https://api.groq.com/openai/v1/audio/transcriptions',
  whisperKey: env.WHISPER_API_KEY || env.GROQ_API_KEY || '',
  whisperModel: env.WHISPER_MODEL || 'whisper-large-v3',

  maxDurationSec: Number(env.MAX_DURATION_SEC) || 1800,
  ytDlpPath: env.YTDLP_PATH || 'yt-dlp',
  ytDlpExtraArgs: (env.YTDLP_EXTRA_ARGS || '--js-runtimes node').split(/\s+/).filter(Boolean),
  // Where the YouTube cookies saved from the app live. Put this on a persistent volume or they are
  // lost when the container restarts (the Docker image uses /data/cookies.txt).
  cookiesPath: env.COOKIES_PATH || path.join(os.tmpdir(), 'musicplayer', 'cookies.txt'),
  cookiesB64: env.YT_COOKIES_B64 || '',
}

export function missingConfig() {
  const missing = []
  if (!config.apiToken || config.apiToken.length < 16) missing.push('API_TOKEN (at least 16 characters)')
  if (!config.supabaseUrl) missing.push('SUPABASE_URL')
  if (!config.supabaseServiceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  return missing
}
