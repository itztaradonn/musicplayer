# Import server

Small Node service the player talks to. Given a YouTube link it:

1. downloads the audio with **yt-dlp** and converts it to MP3 (**ffmpeg**),
2. uploads the MP3 and a square cover image to your Supabase `music` bucket and adds a row to `tracks`,
3. optionally listens to the song with **Whisper** and saves synced lyrics (LRC) on that row.

It exists because browsers can't download from YouTube, and Vercel's serverless functions are a poor fit for yt-dlp and ffmpeg.

## One-time setup

1. **Database.** In Supabase open *SQL Editor*, paste [`supabase/migrations/001_music_metadata.sql`](../supabase/migrations/001_music_metadata.sql) and run it. Existing songs are untouched.
2. **Keys.**
   - Supabase *Project Settings → API → `service_role` secret*. Treat it like a password.
   - A Whisper key for automatic lyrics: a [Groq](https://console.groq.com) key (cheap/free tier, fast) or an OpenAI key (see `.env.example`). Skip it and you can still paste lyrics yourself.
   - An access token you invent: `openssl rand -hex 24`.
3. **Deploy** (below), then in the player tap the link icon, enter the server address and token once. They're saved on that device only.

## Hosting

**Recommended: [Railway](https://railway.com)** (paid hobby plan, about $5/month; check current pricing).

1. New Project → *Deploy from GitHub repo* → this repo.
2. Service Settings → **Root Directory = `server`**. Railway finds the `Dockerfile`.
3. Variables: everything in `.env.example` (`API_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WHISPER_API_KEY`, `ALLOWED_ORIGINS`).
4. Settings → Networking → *Generate Domain*. That URL is the "server address" in the player.

Other fine choices: **Fly.io**, **Render**, or a small VPS (Hetzner, about €4/month) running `docker build -t import . && docker run -p 8787:8787 --env-file .env import` behind Caddy for HTTPS.

### The honest caveat: YouTube and datacenter IPs

YouTube often blocks downloads from cloud/datacenter IP addresses with *"Sign in to confirm you're not a bot"*. No host is guaranteed to avoid this, and it can change over time. In order of effort:

1. **Cookies.** Log in to YouTube in a browser, export cookies for youtube.com as a Netscape `cookies.txt` (e.g. with the "Get cookies.txt LOCALLY" extension), then set `YT_COOKIES_B64` to `base64 -w0 cookies.txt`. Use a throwaway Google account if you can: automated use of an account can get it flagged.
2. **Run it at home** on a spare PC or Raspberry Pi and expose it with a free Cloudflare Tunnel. A home IP is rarely blocked. This is the most reliable option.

yt-dlp breaks when YouTube changes things. The Docker build always installs the newest yt-dlp, so **redeploy** the service if downloads suddenly start failing.

Downloading from YouTube is against its terms of service, and music is copyrighted. Keep this to personal use.

## Local run

```bash
cd server && npm install
# needs yt-dlp and ffmpeg on your PATH
API_TOKEN=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... WHISPER_API_KEY=... npm start
npm test
```

## API

All routes except `/api/health` need `Authorization: Bearer <API_TOKEN>`.

| Route | What it does |
| --- | --- |
| `GET /api/health` | `{ ok, lyrics }` (whether auto lyrics are configured) |
| `POST /api/import` `{ url, autoLyrics }` | Starts an import, returns a job |
| `POST /api/tracks/:id/generate-lyrics` | Transcribes an existing track |
| `PUT /api/tracks/:id/lyrics` `{ lyrics }` | Saves lyrics you typed (plain or LRC) |
| `GET /api/jobs/:id` | Job status: `stage` is `downloading`, `saving` or `transcribing`; includes the saved `track` |

Jobs run one at a time and are kept in memory, so a restart forgets running jobs (finished songs are already in Supabase).

## Notes

- The song is saved *before* transcription starts, so a lyrics failure never loses the download. It comes back as a warning.
- Whisper can invent words over instrumental sections. Sung lyrics are the hardest case for speech-to-text, so give automatic lyrics a quick read and fix anything that's off (pencil icon in the player).
