import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uid } from '@/__tests__/helpers/recording-supabase';
import { approveImport, rejectImport, submitForApproval } from '@/actions/imports/process-import';

/** Issue #628: maker != checker. The submitter of an import may not approve it. */

const { authorizePermission, createServerSupabaseClient, logAudit, notifyAdmins } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  logAudit: vi.fn(),
  notifyAdmins: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('@/lib/supabase/fetch-all-rows', () => ({ fetchAllRows: vi.fn() }));
vi.mock('@/lib/notifications/admin-notifier', () => ({ notifyAdmins }));
vi.mock('@/actions/reference/transaction-tags', () => ({
  autoTagTransaction: vi.fn(async () => ({ tag: null, matchedKeyword: null })),
}));

const SELF_APPROVAL_ERROR = 'You submitted this import, so a different approver is required';
const ME = 'user-me';
const OTHER = 'user-other';

let updates: Array<Record<string, unknown>>;
let eqs: Array<[string, unknown]>;
let currentStatus: string;
let submittedBy: string | null | undefined;
let actingUser: string | null;

beforeEach(() => {
  vi.clearAllMocks();
  updates = [];
  eqs = [];
  currentStatus = 'awaiting_approval';
  submittedBy = null;
  actingUser = ME;
  authorizePermission.mockImplementation(async () => ({ authorized: true, userId: actingUser }));
  createServerSupabaseClient.mockImplementation(async () => ({
    auth: { getUser: async () => ({ data: { user: actingUser ? { id: actingUser } : null }, error: null }) },
    from() {
      let op = '';
      const chain: Record<string, unknown> = {};
      chain.select = () => {
        if (!op) op = 'select';
        return chain;
      };
      chain.update = (vals: Record<string, unknown>) => {
        op = 'update';
        updates.push(vals);
        return chain;
      };
      chain.eq = (col: string, val: unknown) => {
        if (op === 'update') eqs.push([col, val]);
        return chain;
      };
      const settle = () =>
        op === 'update'
          ? { data: [{ id: uid(1) }], error: null }
          : {
              data: {
                id: uid(1),
                file_name: 'jan.csv',
                status: currentStatus,
                import_summary: {},
                ...(submittedBy === undefined ? {} : { submitted_by: submittedBy }),
              },
              error: null,
            };
      chain.single = async () => settle();
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve(settle()).then(res);
      return chain;
    },
  }));
});

describe('submitForApproval records the submitter (#628)', () => {
  beforeEach(() => {
    currentStatus = 'processing';
  });

  it('writes submitted_by and submitted_at in the same guarded update as the status', async () => {
    const res = await submitForApproval(uid(1));
    expect(res.error).toBeNull();
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ status: 'awaiting_approval', submitted_by: ME });
    expect(Number.isNaN(Date.parse(String(updates[0].submitted_at)))).toBe(false);
    expect(eqs).toContainEqual(['status', 'processing']);
    expect(eqs).toContainEqual(['id', uid(1)]);
  });
});

describe('approveImport self-approval rule (#628)', () => {
  it('rejects the submitter: exact error, no update, no audit', async () => {
    submittedBy = ME;
    const res = await approveImport(uid(1), 'ok');
    expect(res.error).toBe(SELF_APPROVAL_ERROR);
    expect(updates).toHaveLength(0);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('approves when the approver is not the submitter', async () => {
    submittedBy = OTHER;
    const res = await approveImport(uid(1), 'ok');
    expect(res.error).toBeNull();
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ status: 'approved', approved_by: ME });
    expect(eqs).toContainEqual(['status', 'awaiting_approval']);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'APPROVE' }));
  });

  it('approves a legacy row whose submitted_by is null', async () => {
    submittedBy = null;
    const res = await approveImport(uid(1));
    expect(res.error).toBeNull();
    expect(updates).toHaveLength(1);
  });

  it('fails closed when the approver cannot be identified, whatever submitted_by is', async () => {
    actingUser = null;
    for (const sub of ['user-someone', null]) {
      submittedBy = sub;
      const res = await approveImport(uid(1), 'ok');
      expect(res.error).toBe('Unauthorized');
    }
    expect(updates).toHaveLength(0);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('approves a row that does not carry the column at all', async () => {
    submittedBy = undefined;
    const res = await approveImport(uid(1));
    expect(res.error).toBeNull();
  });
});

describe('rejectImport is not subject to the rule (#628)', () => {
  it('lets the submitter withdraw their own submission', async () => {
    submittedBy = ME;
    const res = await rejectImport(uid(1), 'withdrawn');
    expect(res.error).toBeNull();
    expect(updates[0]).toMatchObject({ status: 'rejected' });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'REJECT' }));
  });
});

describe('submitted_by migration (#628)', () => {
  const migrationsDir = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
  const FILE = '20261015110000_bank_statement_imports_submitted_by.sql';
  const migration = readFileSync(path.join(migrationsDir, FILE), 'utf8').replace(/\r\n/g, '\n');
  const active = (migration.match(/^BEGIN;[\s\S]*?^COMMIT;/m)?.[0] ?? '')
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ');

  it('adds both columns nullable, with no NOT NULL or default', () => {
    expect(active).toContain('ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL');
    expect(active).toContain('ADD COLUMN IF NOT EXISTS submitted_at timestamptz');
    expect(active).not.toMatch(/NOT NULL|DEFAULT/i);
  });

  it('changes no RLS, policy or grant and drops nothing', () => {
    expect(active).not.toMatch(/POLICY|ROW LEVEL SECURITY|GRANT|REVOKE|\bDROP\b/i);
  });

  it('documents ROLLBACK and VERIFY', () => {
    expect(migration).toContain('-- ROLLBACK');
    expect(migration).toContain('DROP COLUMN IF EXISTS submitted_by;');
    expect(migration).toContain('DROP COLUMN IF EXISTS submitted_at;');
    expect(migration).toContain('-- VERIFY');
  });

  it('has a unique version and sorts after the migration that creates the table', () => {
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    expect(files.filter((f) => f.startsWith(`${FILE.split('_')[0]}_`))).toEqual([FILE]);
    const created = files.find((f) => f.includes('create_bank_statement_import_schema'));
    expect(created).toBeDefined();
    expect(files.indexOf(FILE)).toBeGreaterThan(files.indexOf(created!));
  });
});
