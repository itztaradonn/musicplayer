import { supabase } from './supabase'

const BUCKET = 'music'

export async function getAllTracks() {
  const { data, error } = await supabase
    .from('tracks')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map((t) => ({
    ...t,
    url: supabase.storage.from(BUCKET).getPublicUrl(t.file_path).data.publicUrl,
  }))
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

  return {
    ...data,
    url: supabase.storage.from(BUCKET).getPublicUrl(data.file_path).data.publicUrl,
  }
}

export async function deleteTrack(id, filePath) {
  await supabase.storage.from(BUCKET).remove([filePath])
  const { error } = await supabase.from('tracks').delete().eq('id', id)
  if (error) throw error
}
