/**
 * #883: create-email-import.ts is a 'use server' module, so every export is client-callable.
 * The import-row writes live in src/lib/email-imports/import-records.ts; this module may only read.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: vi.fn() }));

describe('create-email-import server actions', () => {
  it('exports only the read actions', async () => {
    const mod = await import('@/actions/email-imports/create-email-import');
    expect(Object.keys(mod).sort()).toEqual(['getEmailImport', 'listEmailImports']);
  });
});
