import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activeLineIndex, parseLyrics } from './lrc.js'

test('parses synced LRC, skips metadata tags, sorts by time', () => {
  const { synced, lines } = parseLyrics('[ti:Song]\n[ar:Me]\n[00:12.50]Second\n[00:01.00]First\n[01:05]Third')
  assert.equal(synced, true)
  assert.deepEqual(lines, [
    { time: 1, text: 'First' },
    { time: 12.5, text: 'Second' },
    { time: 65, text: 'Third' },
  ])
})

test('supports several stamps per line, word stamps and CRLF', () => {
  const { lines } = parseLyrics('[00:10.00][00:30.00]Chorus <00:10.10>line\r\n[00:20.00]Verse')
  assert.deepEqual(lines.map((l) => [l.time, l.text]), [[10, 'Chorus line'], [20, 'Verse'], [30, 'Chorus line']])
})

test('treats text without stamps as plain lyrics and collapses blank runs', () => {
  const { synced, lines } = parseLyrics('\n\nLine one\nLine two\n\n\n\nLine three\n\n')
  assert.equal(synced, false)
  assert.deepEqual(lines.map((l) => l.text), ['Line one', 'Line two', '', 'Line three'])
  assert.ok(lines.every((l) => l.time === null))
})

test('empty or whitespace input gives no lines', () => {
  for (const v of [null, undefined, '', '  \n ']) assert.deepEqual(parseLyrics(v), { synced: false, lines: [] })
})

test('milliseconds with three digits parse as fractions of a second', () => {
  assert.equal(parseLyrics('[00:01.250]x').lines[0].time, 1.25)
})

test('activeLineIndex finds the current line', () => {
  const lines = [{ time: 5, text: 'a' }, { time: 10, text: 'b' }, { time: 20, text: 'c' }]
  assert.equal(activeLineIndex(lines, 0), -1)
  assert.equal(activeLineIndex(lines, 4.9), 0) // small lookahead keeps highlight on beat
  assert.equal(activeLineIndex(lines, 12), 1)
  assert.equal(activeLineIndex(lines, 999), 2)
  assert.equal(activeLineIndex([], 3), -1)
})
