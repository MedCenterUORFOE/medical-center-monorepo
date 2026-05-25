// apps/web/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// The fallback hack only lives here, ONCE!
const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseKey);