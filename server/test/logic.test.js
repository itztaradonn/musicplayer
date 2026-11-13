import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanSegments, formatTimestamp, segmentsToLrc } from '../src/lrc.js'
import { cleanTitle, deriveMetadata } from '../src/metadata.js'
import { friendlyYtDlpError, parseYoutubeUrl } from '../src/youtube.js'

test('parseYoutubeUrl normalises common link shapes', () => {
  const id = 'dQw4w9WgXcQ'
  const expected = `https://www.youtube.com/watch?v=${id}`
  for (const input of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://m.youtube.com/watch?v=${id}&list=PL123&index=2`,
    `https://music.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `  https://youtube.com/embed/${id}  `,
  ]) assert.equal(parseYoutubeUrl(input).url, expected, input)
})

test('parseYoutubeUrl rejects other hosts, junk and look-alikes', () => {
  for (const input of [
    '', 'not a url', 'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ', 'file:///etc/passwd',
    'https://www.youtube.com/playlist?list=PL123', 'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/watch?v=--output%20x1',
  ]) assert.throws(() => parseYoutubeUrl(input), undefined, input)
})

test('cleanTitle strips video clutter but keeps meaningful brackets', () => {
  assert.equal(cleanTitle('Song Name (Official Video)'), 'Song Name')
  assert.equal(cleanTitle('Song Name [Official Music Video] (HD)'), 'Song Name')
  assert.equal(cleanTitle('Song Name (feat. Someone)'), 'Song Name (feat. Someone)')
  assert.equal(cleanTitle('Song Name | Official Audio'), 'Song Name')
})

test('deriveMetadata prefers YouTube Music fields, then "Artist - Title", then channel', () => {
  assert.deepEqual(
    deriveMetadata({ track: 'Blinding Lights', artists: ['The Weeknd'], title: 'x', duration: 200.4 }),
    { title: 'Blinding Lights', artist: 'The Weeknd', duration: 200 },
  )
  assert.deepEqual(
    deriveMetadata({ title: 'Adele - Hello (Official Video)', channel: 'AdeleVEVO', duration: 300 }),
    { title: 'Hello', artist: 'Adele', duration: 300 },
  )
  assert.deepEqual(
    deriveMetadata({ title: 'Lofi beats', channel: 'Chill Guy - Topic' }),
    { title: 'Lofi beats', artist: 'Chill Guy', duration: null },
  )
})

test('formatTimestamp pads minutes, seconds and hundredths', () => {
  assert.equal(formatTimestamp(0), '[00:00.00]')
  assert.equal(formatTimestamp(61.5), '[01:01.50]')
  assert.equal(formatTimestamp(605.239), '[10:05.24]')
})

test('cleanSegments drops silence, filler, junk and repeat loops', () => {
  const out = cleanSegments([
    { start: 0, text: ' Hello darkness ', no_speech_prob: 0.1, avg_logprob: -0.3 },
    { start: 5, text: 'Thanks for watching!' },
    { start: 6, text: '♪♪' },
    { start: 8, text: 'mumble', no_speech_prob: 0.9, avg_logprob: -1.2 },
    { start: 9, text: 'unsure words', avg_logprob: -2 },
    { start: 9.5, text: 'sung but flagged quiet', no_speech_prob: 0.8, avg_logprob: -0.4 },
    ...[10, 12, 14, 16, 18].map((start) => ({ start, text: 'la la la' })),
    { start: 20, text: '   ' },
  ])
  assert.deepEqual(out.map((s) => s.text), ['Hello darkness', 'sung but flagged quiet', 'la la la', 'la la la', 'la la la'])
})

test('cleanSegments keeps lyrics in any script (Thai, Japanese, accents)', () => {
  const texts = ['สวัสดีครับ', '愛してる', 'Déjà vu', 'Привет']
  const out = cleanSegments(texts.map((text, i) => ({ start: i, text })))
  assert.deepEqual(out.map((s) => s.text), texts)
})

test('segmentsToLrc outputs one timestamped line per segment', () => {
  assert.equal(
    segmentsToLrc([{ start: 1.234, text: 'One' }, { start: 75, text: 'Two' }]),
    '[00:01.23]One\n[01:15.00]Two',
  )
  assert.equal(segmentsToLrc([]), '')
})

test('friendlyYtDlpError explains the common failures', () => {
  assert.match(friendlyYtDlpError("ERROR: Sign in to confirm you're not a bot"), /cookies/)
  assert.match(friendlyYtDlpError('ERROR: Video unavailable'), /unavailable/)
  assert.match(friendlyYtDlpError('', 'SIGKILL'), /too long/)
})
