import { createClient } from '@supabase/supabase-js'

// The anon key is designed to be public: what it can do is limited by the row level security
// policies in supabase/migrations/001_music_schema.sql. Override with VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY to point at another project. NEVER put the service_role key here.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://fsrcoljwsjafymremwgf.supabase.co'
const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzcmNvbGp3c2phZnltcmVtd2dmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MzI4MjQsImV4cCI6MjExMDEwODgyNH0.lPRh0t-mk7ve99tSoYefI41hCH62Vi1p6nVLqT2t-SE'

export const supabase = createClient(supabaseUrl, supabaseKey)
