# Import server

The Node service behind the YouTube button. In production it is **one service that also serves the website**, built by the [`Dockerfile`](../Dockerfile) at the repo root. Given a YouTube link it:

1. downloads the audio with **yt-dlp** and converts it to MP3 (**ffmpeg**),
2. uploads the MP3 and a square cover image to your Supabase `music` bucket and adds a row to `tracks`,
3. optionally listens to the song with **Whisper** and saves synced lyrics (LRC) on that row.

Browsers can't download from YouTube themselves, which is why this runs on a server.

## One-time setup

1. **Database.** In Supabase open *SQL Editor*, paste [`supabase/migrations/001_music_metadata.sql`](../supabase/migrations/001_music_metadata.sql) and run it. Existing songs are untouched.
2. **Keys.**
   - Supabase *Project Settings → API → `service_role` secret*. Treat it like a password.
   - A Whisper key for automatic lyrics: a [Groq](https://console.groq.com) key or an OpenAI key (see `.env.example`). Skip it and you can still paste lyrics yourself.
   - An access token you invent: `openssl rand -hex 24`.
3. **Deploy on Northflank** (below). Open the service's URL, tap the link icon, and enter the token once. It is saved on that device only.

## Deploy on Northflank

1. **Create a project**, then **Add service → Combined service** (build from Git and deploy).
2. **Repository:** connect GitHub, pick `itztaradonn/musicplayer` and the branch to deploy.
3. **Build:** choose **Dockerfile**, Dockerfile location `/Dockerfile`, build context `/` (the repo root, not `server/`).
4. **Networking:** add port **8787**, protocol **HTTP**, and make it **publicly exposed**. Northflank gives you an `https://…code.run` address, which is your website.
5. **Runtime variables** (mark the secrets as secret):

   | Variable | Value |
   | --- | --- |
   | `API_TOKEN` | the token you invented |
   | `SUPABASE_URL` | `https://YOUR-PROJECT.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key |
   | `WHISPER_API_KEY` | your Groq/OpenAI key (optional) |
   | `YT_COOKIES_B64` | only if YouTube blocks you, see below |

   `PORT` and `STATIC_DIR` are already set by the image.
6. **Resources:** a small plan is enough; I'd start with about 1 GB of RAM for ffmpeg and yt-dlp.
7. **Health check** (optional): HTTP `GET /api/health` on port 8787.

Because the site and the API share one address, there is no CORS setup and no server address to type in. Only the token.

### Keeping yt-dlp fresh

yt-dlp breaks whenever YouTube changes something, and updates fix it. Docker reuses the cached download, so a plain redeploy may keep the old version. In Northflank set the build argument **`YTDLP_REFRESH`** to any new value (for example today's date) and rebuild. That forces a fresh download of the newest yt-dlp.

### The honest caveat: YouTube and datacenter IPs

YouTube often blocks downloads from cloud/datacenter IP addresses with *"Sign in to confirm you're not a bot"*. No host is guaranteed to avoid this, and it can change over time. In order of effort:

1. **Cookies.** Log in to YouTube in a browser, export cookies for youtube.com as a Netscape `cookies.txt` (e.g. with the "Get cookies.txt LOCALLY" extension), then set `YT_COOKIES_B64` to the output of `base64 -w0 cookies.txt`. Use a throwaway Google account if you can: automated use of an account can get it flagged.
2. **Run it at home** on a spare PC or Raspberry Pi (same Docker image) and expose it with a free Cloudflare Tunnel. A home IP is rarely blocked. This is the most reliable option.

Downloading from YouTube is against its terms of service, and music is copyrighted. Keep this to personal use.

## Local run

```bash
npm run build                 # in the repo root: builds the site into dist/
cd server && npm install      # needs yt-dlp and ffmpeg on your PATH
STATIC_DIR=../dist API_TOKEN=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... WHISPER_API_KEY=... npm start
npm test
```

Open http://localhost:8787. For front-end work with `npm run dev`, the site runs on another port, so set the server address in the app's server settings (or `VITE_IMPORT_API_URL`) and allow that origin with `ALLOWED_ORIGINS=http://localhost:5173`.

## Hosting the site elsewhere (optional)

You can still host the website on Vercel and run only the API on Northflank: set `VITE_IMPORT_API_URL` on Vercel to the Northflank address and `ALLOWED_ORIGINS` on the server to your Vercel address. Not needed for the one-service setup.

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
