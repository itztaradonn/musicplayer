# One image runs the whole app: the website AND the YouTube importer (yt-dlp + ffmpeg).
# Build context = repo root.

# ---- 1. build the website
FROM node:22-slim AS web
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

# ---- 2. runtime: Node + ffmpeg + yt-dlp, serving the site and the API
FROM node:22-slim
# Change this build argument (any new value) to force a fresh download of the newest yt-dlp,
# because Docker otherwise reuses the cached layer below. Needed when YouTube breaks old versions.
ARG YTDLP_REFRESH=1
# ffmpeg converts audio; curl fetches the standalone yt-dlp binary (no Python needed)
RUN echo "yt-dlp refresh: ${YTDLP_REFRESH}" \
 && apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
 && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/src ./src
COPY --from=web /web/dist ./public

# Saved YouTube cookies go here. Mount a persistent volume at /data or they reset on restart.
RUN mkdir -p /data
ENV NODE_ENV=production \
    STATIC_DIR=/app/public \
    COOKIES_PATH=/data/cookies.txt \
    PORT=8787
EXPOSE 8787
CMD ["node", "src/index.js"]
