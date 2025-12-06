const envMode = process.env.NEXT_PUBLIC_ENV_MODE || 'local';

export const supabaseConfig = {
  url: envMode === 'local'
    ? process.env.NEXT_PUBLIC_SUPABASE_URL_LOCAL!
    : process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD!,
  anonKey: envMode === 'local'
    ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_LOCAL!
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_CLOUD!,
  serviceRoleKey: envMode === 'local'
    ? process.env.SUPABASE_SERVICE_ROLE_KEY_LOCAL!
    : process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD!,
  isLocal: envMode === 'local',
};
