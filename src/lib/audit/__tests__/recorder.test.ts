import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const getUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser } })),
  createAdminClient: vi.fn(),
}));

import {
  ENTITY_DISPLAY_FIELDS,
  recordAudit,
  resolveEntityDisplay,
  type AuditEntry,
  type AuditSink,
} from '@/lib/audit/recorder';
import { AUDIT_ENTITY_LABELS, type AuditEntityType, type AuditLogInsert } from '@/types/database';

function fakeSink(result: { error: { message: string } | null } = { error: null }) {
  const rows: AuditLogInsert[] = [];
  const sink: AuditSink = {
    insert: vi.fn(async (row: AuditLogInsert) => {
      rows.push(row);
      return result;
    }),
  };
  return { sink, rows };
}

const actor = { userId: 'user-1' };

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return { action: 'UPDATE', entityType: 'houses', entityId: 'house-1', ...overrides };
}

describe('recordAudit', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  describe('diff', () => {
    it('stores only the changed fields when both rows are given', async () => {
      const { sink, rows } = fakeSink();

      const result = await recordAudit(
        entry({
          oldRow: { name: 'Old', street: 'Elm', rooms: 3 },
          newRow: { name: 'New', street: 'Elm', rooms: 3 },
        }),
        actor,
        sink
      );

      expect(result).toEqual({ recorded: true });
      expect(rows[0].old_values).toEqual({ name: 'Old' });
      expect(rows[0].new_values).toEqual({ name: 'New' });
    });

    it('stores empty diffs when nothing changed', async () => {
      const { sink, rows } = fakeSink();

      await recordAudit(entry({ oldRow: { a: 1 }, newRow: { a: 1 } }), actor, sink);

      expect(rows[0].old_values).toEqual({});
      expect(rows[0].new_values).toEqual({});
    });

    it('stores a lone newRow whole (create) and a lone oldRow whole (delete)', async () => {
      const created = fakeSink();
      await recordAudit(entry({ action: 'CREATE', newRow: { a: 1 } }), actor, created.sink);
      expect(created.rows[0].old_values).toBeNull();
      expect(created.rows[0].new_values).toEqual({ a: 1 });

      const deleted = fakeSink();
      await recordAudit(entry({ action: 'DELETE', oldRow: { a: 1 } }), actor, deleted.sink);
      expect(deleted.rows[0].old_values).toEqual({ a: 1 });
      expect(deleted.rows[0].new_values).toBeNull();
    });

    it('uses explicit oldValues/newValues as given, ignoring rows', async () => {
      const { sink, rows } = fakeSink();

      await recordAudit(
        entry({
          oldValues: { x: 'explicit-old' },
          newValues: { x: 'explicit-new' },
          oldRow: { x: 'row-old', y: 1 },
          newRow: { x: 'row-new', y: 2 },
        }),
        actor,
        sink
      );

      expect(rows[0].old_values).toEqual({ x: 'explicit-old' });
      expect(rows[0].new_values).toEqual({ x: 'explicit-new' });
    });
  });

  describe('entity display', () => {
    it('prefers an explicit entityDisplay over the resolver', async () => {
      const { sink, rows } = fakeSink();

      await recordAudit(
        entry({ entityDisplay: 'Explicit', newRow: { house_number: '12' } }),
        actor,
        sink
      );

      expect(rows[0].entity_display).toBe('Explicit');
    });

    it('resolves from newRow, falling back to oldRow', async () => {
      const fromNew = fakeSink();
      await recordAudit(
        entry({ oldRow: { house_number: 'old' }, newRow: { house_number: 'new' } }),
        actor,
        fromNew.sink
      );
      expect(fromNew.rows[0].entity_display).toBe('new');

      const fromOld = fakeSink();
      await recordAudit(entry({ action: 'DELETE', oldRow: { house_number: 'old' } }), actor, fromOld.sink);
      expect(fromOld.rows[0].entity_display).toBe('old');
    });

    it('leaves entity_display null when nothing resolves', async () => {
      const { sink, rows } = fakeSink();

      await recordAudit(entry(), actor, sink);

      expect(rows[0].entity_display).toBeNull();
    });
  });

  describe('written row', () => {
    it('has the columns logAudit has always written', async () => {
      const { sink, rows } = fakeSink();

      await recordAudit(
        entry({
          action: 'APPROVE',
          entityType: 'approval_requests',
          entityId: 'req-1',
          entityDisplay: 'Approval #req-1',
          description: 'why',
          metadata: { k: 'v' },
        }),
        actor,
        sink
      );

      expect(rows).toEqual([
        {
          actor_id: 'user-1',
          action: 'APPROVE',
          entity_type: 'approval_requests',
          entity_id: 'req-1',
          entity_display: 'Approval #req-1',
          old_values: null,
          new_values: null,
          description: 'why',
          metadata: { k: 'v' },
          ip_address: null,
          user_agent: null,
        },
      ]);
    });
  });

  describe('failure policy', () => {
    it('writes nothing and reports not recorded when there is no actor', async () => {
      const { sink } = fakeSink();

      const result = await recordAudit(entry(), { userId: null }, sink);

      expect(result).toEqual({ recorded: false });
      expect(sink.insert).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith('[Audit] Cannot log audit: No authenticated user');
    });

    it('reports not recorded and logs structured context when the sink returns an error', async () => {
      const { sink } = fakeSink({ error: { message: 'insert denied' } });

      const result = await recordAudit(entry({ entityId: 'house-9' }), actor, sink);

      expect(result).toEqual({ recorded: false });
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Audit]'),
        expect.objectContaining({
          entityType: 'houses',
          entityId: 'house-9',
          action: 'UPDATE',
          error: 'insert denied',
        })
      );
    });

    it('does not throw when the sink throws', async () => {
      const boom = new Error('network down');
      const sink: AuditSink = { insert: vi.fn().mockRejectedValue(boom) };

      await expect(recordAudit(entry(), actor, sink)).resolves.toEqual({ recorded: false });
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Audit]'),
        expect.objectContaining({ entityId: 'house-1', error: boom })
      );
    });

    it('does not resolve a session itself: the actor is all it needs', async () => {
      const { sink, rows } = fakeSink();

      await recordAudit(entry(), actor, sink);

      expect(getUser).not.toHaveBeenCalled();
      expect(rows).toHaveLength(1);
    });
  });
});

describe('resolveEntityDisplay', () => {
  it.each<[AuditEntityType, Record<string, unknown>, string]>([
    ['streets', { name: 'Elm Street' }, 'Elm Street'],
    ['announcements', { title: 'Water outage' }, 'Water outage'],
    ['app_roles', { display_name: 'Chairman', name: 'chairman' }, 'Chairman'],
    ['residents', { first_name: 'Ada', last_name: 'Okafor', resident_code: 'R1' }, 'Ada Okafor'],
    ['houses', { house_number: '12A' }, '12A'],
    ['bank_statement_imports', { file_name: 'jan.csv' }, 'jan.csv'],
    ['invoices', { invoice_number: 'INV-001' }, 'INV-001'],
    ['estate_bank_accounts', { bank_name: 'GTB', account_number: '0123' }, 'GTB 0123'],
    ['profiles', { full_name: '', email: 'a@b.co' }, 'a@b.co'],
    // a type with no usable evidence uses the default name/title/display_name
    ['wallets', { title: 'Wallet title' }, 'Wallet title'],
  ])('%s resolves %j to %s', (entityType, row, expected) => {
    expect(resolveEntityDisplay(entityType, row)).toBe(expected);
  });

  it('joins only the present parts of a composite', () => {
    expect(resolveEntityDisplay('residents', { first_name: 'Ada', last_name: '' })).toBe('Ada');
  });

  it('returns undefined with no row, or when no candidate holds a string', () => {
    expect(resolveEntityDisplay('houses', null)).toBeUndefined();
    expect(resolveEntityDisplay('houses', undefined)).toBeUndefined();
    expect(resolveEntityDisplay('houses', { house_number: 12 })).toBeUndefined();
  });

  it('has a display entry for every audit entity type', () => {
    const members = Object.keys(AUDIT_ENTITY_LABELS) as AuditEntityType[];

    expect(members.length).toBeGreaterThan(0);
    for (const member of members) {
      expect(ENTITY_DISPLAY_FIELDS[member], member).toBeDefined();
      expect(ENTITY_DISPLAY_FIELDS[member].length, member).toBeGreaterThan(0);
    }
    expect(Object.keys(ENTITY_DISPLAY_FIELDS).sort()).toEqual([...members].sort());
  });
});
