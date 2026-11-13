# My Music

A personal music player (React + Vite + Tailwind, PWA) backed by Supabase and deployed on Vercel.

- Upload MP3s, or **paste a YouTube link** and the song is downloaded into your library with its title, artist and cover.
- **Apple Music-style Now Playing**: blurred cover backdrop, big artwork, and **synced lyrics** that follow the song (tap a line to jump to it).
- Lyrics are **generated automatically** from the audio (Whisper) or **added by you** (plain text or `.lrc`), editable any time.

## Run the player

```bash
npm install
npm run dev      # http://localhost:5173
npm run lint
npm test         # lyrics parsing
```

## YouTube import and lyrics (one Northflank service)

Downloading and transcribing need yt-dlp and ffmpeg, which can't run in the browser or on Vercel. So one Docker image, built from the root [`Dockerfile`](Dockerfile), runs **both the website and the importer**. Setup is three steps, all in [`server/README.md`](server/README.md):

1. The database (`tracks` table, `music` bucket, access rules) is defined in [`supabase/migrations/001_music_schema.sql`](supabase/migrations/001_music_schema.sql) and already applied to the `music` project.
2. Deploy the repo on Northflank from the Dockerfile and set a few environment variables.
3. Open your Northflank address, tap the link icon, and enter your access token once (stored on that device only).

Never put the token or the Supabase `service_role` key in a `VITE_` variable: those end up in the public website.

Without the importer, uploading MP3s and playing music work exactly as before.
