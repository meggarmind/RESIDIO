import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PERMISSIONS } from '@/lib/auth/action-roles';

/**
 * Issue #388: saveGeneratedReport had no authorization check and picked the
 * service-role client from a caller-supplied `generation_trigger`. It is now
 * interactive-only (session client, REPORTS_VIEW_FINANCIAL); cron writes live in
 * src/lib/reports/scheduled-report-store.ts.
 */

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  createAdminClient: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { saveGeneratedReport } from '@/actions/reports/report-schedules';

const valid = {
  name: 'Financial Overview',
  report_type: 'financial_overview' as const,
  period_start: '2026-01-01',
  period_end: '2026-01-31',
  report_data: { ok: true },
};

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insert.mockReturnValue({
    select: () => ({
      single: async () => ({ data: { id: 'r1', name: valid.name }, error: null }),
    }),
  });
  mocks.createServerSupabaseClient.mockResolvedValue({
    from: () => ({ insert: mocks.insert }),
  });
});

describe('saveGeneratedReport authorization (#388)', () => {
  it('rejects an unauthorized caller without touching the database, admin client or audit log', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'nope', userId: null });

    const result = await saveGeneratedReport(valid);

    expect(result.data).toBeNull();
    expect(result.error).toBe('nope');
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('inserts on the session client as a manual, unscheduled report under REPORTS_VIEW_FINANCIAL', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: true, userId: 'u1' });

    const result = await saveGeneratedReport(valid);

    expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.REPORTS_VIEW_FINANCIAL);
    expect(result.error).toBeNull();
    expect(mocks.createServerSupabaseClient).toHaveBeenCalledTimes(1);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    const payload = mocks.insert.mock.calls[0][0];
    expect(payload.generation_trigger).toBe('manual');
    expect(payload.schedule_id).toBeNull();
    expect(payload.generated_by).toBe('u1');
  });

  it('ignores smuggled generation_trigger and schedule_id and never uses the admin client', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: true, userId: 'u1' });

    await saveGeneratedReport({ ...valid, generation_trigger: 'scheduled', schedule_id: 'x' } as never);

    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    const payload = mocks.insert.mock.calls[0][0];
    expect(payload.generation_trigger).toBe('manual');
    expect(payload.schedule_id).toBeNull();
  });

  it('logs a CREATE audit entry once after a successful save', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: true, userId: 'u1' });

    await saveGeneratedReport(valid);

    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit.mock.calls[0][0]).toMatchObject({ action: 'CREATE', entityId: 'r1' });
  });
});

describe('scheduled report code separation (#388)', () => {
  it('keeps the admin client out of the server-action file', () => {
    expect(read('actions/reports/report-schedules.ts')).not.toContain('createAdminClient');
  });

  it('keeps the service-role store out of the server-action boundary', () => {
    const store = read('lib/reports/scheduled-report-store.ts');
    expect(store).not.toMatch(/['"]use server['"]/);
    expect(store).toContain('createAdminClient');
  });
});
