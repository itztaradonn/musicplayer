import { supabase } from './supabase'

const BUCKET = 'music'

const publicUrl = (path) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

// Rows created before the YouTube feature have no artist/artwork/lyrics (undefined or null).
export function withUrls(row) {
  return {
    ...row,
    url: publicUrl(row.file_path),
    artworkUrl: row.artwork_path ? publicUrl(row.artwork_path) : null,
  }
}

export async function getAllTracks() {
  const { data, error } = await supabase
    .from('tracks')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map(withUrls)
}

export async function addTrack(file) {
  const safeName = `${Date.now()}_${crypto.randomUUID()}.mp3`
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(safeName, file, { contentType: 'audio/mpeg' })
  if (uploadError) throw uploadError

  const name = file.name.replace(/\.mp3$/i, '')
  const fileName = safeName
  const { data, error } = await supabase
    .from('tracks')
    .insert({ name, file_path: fileName })
    .select()
    .single()
  if (error) throw error

  return withUrls(data)
}

export async function deleteTrack(id, filePath, artworkPath) {
  await supabase.storage.from(BUCKET).remove([filePath, artworkPath].filter(Boolean))
  const { error } = await supabase.from('tracks').delete().eq('id', id)
  if (error) throw error
}
