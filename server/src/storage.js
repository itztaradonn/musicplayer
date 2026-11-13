import { createClient } from '@supabase/supabase-js'
import { config } from './config.js'
import { UserError } from './youtube.js'

let client
function db() {
  client ??= createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}

function explain(error) {
  if (/column .* (does not exist|of relation)|schema cache/i.test(error.message || ''))
    return new UserError('The database is missing the new columns. Run supabase/migrations/001_music_metadata.sql in the Supabase SQL editor.')
  return new Error(error.message || 'Database error')
}

export async function uploadObject(objectPath, body, contentType) {
  const { error } = await db().storage.from(config.bucket).upload(objectPath, body, { contentType, upsert: false })
  if (error) throw new Error(`Upload failed: ${error.message}`)
}

export async function removeObjects(paths) {
  const list = paths.filter(Boolean)
  if (list.length) await db().storage.from(config.bucket).remove(list).catch(() => {})
}

export async function downloadObject(objectPath) {
  const { data, error } = await db().storage.from(config.bucket).download(objectPath)
  if (error) throw new Error(`Could not read the audio file: ${error.message}`)
  return Buffer.from(await data.arrayBuffer())
}

export async function insertTrack(row) {
  const { data, error } = await db().from('tracks').insert(row).select().single()
  if (error) throw explain(error)
  return data
}

export async function getTrack(id) {
  const { data, error } = await db().from('tracks').select('*').eq('id', id).maybeSingle()
  if (error) throw explain(error)
  if (!data) throw new UserError('Track not found.')
  return data
}

export async function updateTrack(id, patch) {
  // .select().single() makes a no-op update (wrong id) an error instead of a silent success.
  const { data, error } = await db().from('tracks').update(patch).eq('id', id).select().single()
  if (error) throw explain(error)
  return data
}
