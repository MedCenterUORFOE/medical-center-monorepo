import { createClient } from '@supabase/supabase-js';

// We check for NEXT_PUBLIC_SUPABASE_URL first (matching your .env)
// If it's missing (like in GitHub CI), it safely falls back to the placeholder.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseKey);
