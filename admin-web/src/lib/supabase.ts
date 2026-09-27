import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** false bila .env belum diisi; aplikasi menampilkan petunjuk konfigurasi. */
export const isConfigured = Boolean(url && anonKey && !url.includes('xxxxxxxx'));

export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'not-configured', {
  auth: { persistSession: true, autoRefreshToken: true },
});
