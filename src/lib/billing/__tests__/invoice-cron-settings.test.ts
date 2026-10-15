import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getInvoiceCronSettings } from '@/lib/billing/invoice-cron-settings';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  inFn: vi.fn(),
  result: { data: [] as unknown, error: null as unknown },
}));

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

function rows(auto?: unknown, day?: unknown) {
  const out: Array<{ key: string; value: unknown }> = [];
  if (auto !== undefined) out.push({ key: 'auto_generate_invoices', value: auto });
  if (day !== undefined) out.push({ key: 'invoice_generation_day', value: day });
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.result = { data: [], error: null };
  mocks.inFn.mockImplementation(() => Promise.resolve(mocks.result));
  mocks.createAdminClient.mockReturnValue({
    from: () => ({ select: () => ({ in: mocks.inFn }) }),
  });
});

describe('getInvoiceCronSettings (#641)', () => {
  it.each([
    [7, 7],
    ['7', 7],
    ['"7"', 7],
    [null, 2],
    [0, 2],
    ['abc', 2],
  ])('parses day %j as %i', async (raw, expected) => {
    mocks.result = { data: rows(true, raw), error: null };
    expect((await getInvoiceCronSettings()).generationDay).toBe(expected);
  });

  it.each([
    [true, true],
    ['true', true],
    [false, false],
    ['false', false],
    [null, false],
  ])('parses auto-generate %j as %s', async (raw, expected) => {
    mocks.result = { data: rows(raw, 2), error: null };
    expect((await getInvoiceCronSettings()).autoGenerate).toBe(expected);
  });

  it('reads both keys in one query', async () => {
    mocks.result = { data: rows(true, 2), error: null };
    await getInvoiceCronSettings();
    expect(mocks.inFn).toHaveBeenCalledTimes(1);
    expect(mocks.inFn).toHaveBeenCalledWith('key', ['auto_generate_invoices', 'invoice_generation_day']);
  });

  it('falls back to the UI defaults for missing rows', async () => {
    expect(await getInvoiceCronSettings()).toEqual({ autoGenerate: true, generationDay: 2 });
    mocks.result = { data: rows(false), error: null };
    expect(await getInvoiceCronSettings()).toEqual({ autoGenerate: false, generationDay: 2 });
    mocks.result = { data: rows(undefined, 9), error: null };
    expect(await getInvoiceCronSettings()).toEqual({ autoGenerate: true, generationDay: 9 });
  });

  it('throws on a query error instead of returning defaults', async () => {
    mocks.result = { data: null, error: { message: 'boom' } };
    await expect(getInvoiceCronSettings()).rejects.toThrow('boom');
  });

  it('uses the admin client, never the session client', async () => {
    mocks.result = { data: rows(true, 2), error: null };
    await getInvoiceCronSettings();
    expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('is not a server-action module', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/billing/invoice-cron-settings.ts'), 'utf8');
    expect(src).not.toMatch(/['"]use server['"]/);
    expect(src).not.toMatch(/createServerSupabaseClient/);
  });
});
