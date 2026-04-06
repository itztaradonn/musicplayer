import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://oipmppdmumxdybvnsusg.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pcG1wcGRtdW14ZHlidm5zdXNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0NzcxMjUsImV4cCI6MjA5MTA1MzEyNX0.WdheloLlt18fcjb_DUhqNP-JQJT-t245ycC5ldXbm58'

export const supabase = createClient(supabaseUrl, supabaseKey)
