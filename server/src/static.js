import fs from 'node:fs'
import path from 'node:path'
import express from 'express'

/**
 * Serves the built website from `dir` with single-page-app fallback, so one service
 * runs both the player and the import API on the same address.
 * Hashed files in /assets are cached forever; everything else (index.html, sw.js,
 * manifest) is always revalidated so a redeploy shows up immediately.
 */
export function mountStatic(app, dir) {
  const root = path.resolve(dir)
  if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error(`STATIC_DIR has no index.html: ${root}`)

  app.use(
    express.static(root, {
      index: false,
      setHeaders(res, file) {
        const immutable = file.startsWith(path.join(root, 'assets') + path.sep)
        res.set('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache')
      },
    }),
  )

  // Unknown API routes must stay JSON 404s, never the HTML page.
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }))

  app.get('/{*splat}', (req, res) => {
    res.set('Cache-Control', 'no-cache')
    res.sendFile(path.join(root, 'index.html'))
  })
}
