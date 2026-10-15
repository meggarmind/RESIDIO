import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeCronStatus } from '@/lib/system/cron-status';

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  runs: [] as Array<Record<string, unknown>>,
  configuredDay: 5,
  runsError: null as { message: string } | null,
  fromCalls: [] as string[],
}));

/** Minimal chainable fake that really applies neq / in / contains / order / limit. */
function makeBuilder(table: string) {
  let rows: Row[] = table === 'invoice_generation_runs' ? [...state.runs] : [];
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder.select = self;
  builder.eq = self;
  builder.not = self;
  builder.lte = self;
  builder.neq = (col: string, val: unknown) => {
    rows = rows.filter((r) => r[col] !== val);
    return builder;
  };
  builder.in = (col: string, vals: unknown[]) => {
    rows = rows.filter((r) => vals.includes(r[col]));
    return builder;
  };
  builder.contains = (col: string, obj: Record<string, unknown>) => {
    rows = rows.filter((r) =>
      Object.entries(obj).every(([k, v]) => (r[col] as Record<string, unknown>)?.[k] === v),
    );
    return builder;
  };
  builder.order = (col: string, opts?: { ascending?: boolean }) => {
    const dir = opts?.ascending === false ? -1 : 1;
    rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -dir : dir));
    return builder;
  };
  builder.limit = () => builder;
  builder.single = () =>
    Promise.resolve(
      table === 'system_settings'
        ? { data: { value: state.configuredDay }, error: null }
        : { data: null, error: null },
    );
  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve({
      data: rows,
      count: 0,
      error: table === 'invoice_generation_runs' ? state.runsError : null,
    });
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      state.fromCalls.push(table);
      return makeBuilder(table);
    },
  }),
}));

function run(status: string, targetMonth: string, extra: Row = {}): Row {
  return {
    status,
    scope: { trigger: 'cron', targetMonth },
    requested_at: `${targetMonth}T06:00:00.000Z`,
    completed_at: null,
    created_count: 10,
    skipped_count: 2,
    failed_count: 0,
    ...extra,
  };
}

async function invoiceJob() {
  const res = await computeCronStatus();
  return res.jobs.find((j) => j.name === 'invoice-generation')!;
}

function setToday(day: number) {
  vi.setSystemTime(new Date(2026, 9, day, 12, 0, 0));
}

beforeEach(() => {
  vi.useFakeTimers();
  state.runs = [];
  state.configuredDay = 5;
  state.runsError = null;
  state.fromCalls = [];
  setToday(17);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('computeCronStatus invoice-generation job (#638)', () => {
  it('is healthy with counts when this month completed', async () => {
    state.runs = [run('completed', '2026-10-01', { completed_at: '2026-10-05T06:01:00.000Z' })];
    const job = await invoiceJob();
    expect(job.status).toBe('healthy');
    expect(job.message).toContain('10 created');
    expect(job.message).toContain('2 skipped');
    expect(job.lastRun).toBe('2026-10-05T06:01:00.000Z');
  });

  it('is a warning when this month completed with errors', async () => {
    state.runs = [run('completed_with_errors', '2026-10-01', { failed_count: 3 })];
    const job = await invoiceJob();
    expect(job.status).toBe('warning');
    expect(job.message).toContain('3 failed');
  });

  it.each(['queued', 'processing'])('is healthy "in progress" while %s', async (status) => {
    state.runs = [run(status, '2026-10-01')];
    const job = await invoiceJob();
    expect(job.status).toBe('healthy');
    expect(job.message).toContain('in progress');
  });

  it('is healthy "Waiting" before the configured day with no run', async () => {
    setToday(3);
    const job = await invoiceJob();
    expect(job.status).toBe('healthy');
    expect(job.message).toBe('Waiting for day 5 (today is day 3)');
    expect(job.lastRun).toBeNull();
    expect(job.lastRunRelative).toBe('never');
  });

  it('is critical OVERDUE on/after the configured day with no run', async () => {
    setToday(5);
    expect((await invoiceJob()).status).toBe('critical');
    setToday(17);
    const job = await invoiceJob();
    expect(job.status).toBe('critical');
    expect(job.message).toContain('OVERDUE');
  });

  it('ignores a previous month run when judging the current month, but reports it as lastRun', async () => {
    state.runs = [run('completed', '2026-08-01')];
    const job = await invoiceJob();
    expect(job.status).toBe('critical');
    expect(job.lastRun).toBe('2026-08-01T06:00:00.000Z');
  });

  it('does not count a cancelled run as having run', async () => {
    state.runs = [run('cancelled', '2026-10-01')];
    const job = await invoiceJob();
    expect(job.status).toBe('critical');
    expect(job.lastRun).toBeNull();
  });

  it.each(['draft', 'awaiting_approval'])('does not count a %s run as having run', async (status) => {
    state.runs = [run(status, '2026-10-01')];
    expect((await invoiceJob()).status).toBe('critical');
  });

  it('counts a manual-trigger run for the month', async () => {
    state.runs = [{ ...run('completed', '2026-10-01'), scope: { trigger: 'manual', targetMonth: '2026-10-01' } }];
    expect((await invoiceJob()).status).toBe('healthy');
  });

  it('is unknown when the runs table cannot be read', async () => {
    state.runsError = { message: 'boom' };
    expect((await invoiceJob()).status).toBe('unknown');
  });

  it('never consults the legacy invoice_generation_log table', async () => {
    state.runs = [run('completed', '2026-10-01')];
    await invoiceJob();
    expect(state.fromCalls).toContain('invoice_generation_runs');
    expect(state.fromCalls).not.toContain('invoice_generation_log');
  });
});
