import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import express from 'express'
import { mountStatic } from '../src/static.js'

let server, base, dir

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'))
  fs.mkdirSync(path.join(dir, 'assets'))
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>app</title>')
  fs.writeFileSync(path.join(dir, 'sw.js'), '// sw')
  fs.writeFileSync(path.join(dir, 'assets', 'index-abc123.js'), 'console.log(1)')
  fs.writeFileSync(path.join(dir, '..', 'secret.txt'), 'top secret')
  const app = express()
  app.get('/api/health', (req, res) => res.json({ ok: true }))
  mountStatic(app, dir)
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => {
  server.close()
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.join(dir, '..', 'secret.txt'), { force: true })
})

test('serves the app shell without caching', async () => {
  for (const p of ['/', '/some/deep/link']) {
    const res = await fetch(base + p)
    assert.equal(res.status, 200)
    assert.match(await res.text(), /<title>app<\/title>/)
    assert.equal(res.headers.get('cache-control'), 'no-cache')
  }
})

test('hashed assets are cached forever, service worker is always revalidated', async () => {
  const asset = await fetch(`${base}/assets/index-abc123.js`)
  assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  assert.equal((await fetch(`${base}/sw.js`)).headers.get('cache-control'), 'no-cache')
})

test('api routes still work and unknown api routes are JSON 404s, not the app', async () => {
  assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { ok: true })
  const res = await fetch(`${base}/api/nope`)
  assert.equal(res.status, 404)
  assert.match(res.headers.get('content-type'), /json/)
})

test('cannot read files outside the site folder', async () => {
  for (const p of ['/../secret.txt', '/%2e%2e/secret.txt', '/assets/..%2f..%2fsecret.txt']) {
    const res = await fetch(base + p)
    assert.doesNotMatch(await res.text(), /top secret/, p)
  }
})

test('refuses to start without a built site', () => {
  assert.throws(() => mountStatic(express(), os.tmpdir()), /no index\.html/)
})
