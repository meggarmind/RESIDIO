import { createAdminClient } from './server';

/**
 * Create an admin Supabase client with elevated privileges.
 * Uses the service role key to bypass RLS for server-side operations.
 *
 * IMPORTANT: Only use this client for trusted server-side operations.
 * Never expose the service role key to the client.
 */
export const createAdminSupabaseClient = createAdminClient;
