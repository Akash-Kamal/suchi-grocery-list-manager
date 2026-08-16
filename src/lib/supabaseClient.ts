import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function getSupabaseUrl(): string {
  return import.meta.env.VITE_SUPABASE_URL || '';
}

export function getSupabaseAnonKey(): string {
  return import.meta.env.VITE_SUPABASE_ANON_KEY || '';
}

export function checkIsSupabaseConfigured(): boolean {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  return Boolean(
    url &&
    key &&
    !url.includes('your-project-ref') &&
    !url.includes('xxxxx')
  );
}

export const isSupabaseConfigured = checkIsSupabaseConfigured();

let _supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (_supabaseInstance) return _supabaseInstance;

  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();

  if (url && key && !url.includes('your-project-ref') && !url.includes('xxxxx')) {
    _supabaseInstance = createClient(url, key, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }

  return _supabaseInstance;
}

export const supabase = getSupabaseClient();
