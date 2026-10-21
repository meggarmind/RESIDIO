/**
 * #908 -- saving the WhatsApp wording: validation and the audited action.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authorizePermission, logAudit, createServerSupabaseClient } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient, createAdminClient: vi.fn() }));

import { updateEventContent } from '@/actions/notifications/templates';
import {
  EVENT_KEYS,
  EVENT_REGISTRY,
  WHATSAPP_MAX_CONTENT_LENGTH,
  mergeEventContent,
  validateOverrides,
} from '@/lib/notifications/event-content-registry';

describe('WhatsApp wording validation', () => {
  it('only payment reminders and receipts are editable on WhatsApp', () => {
    expect(EVENT_KEYS.filter((key) => EVENT_REGISTRY[key].whatsapp)).toEqual([
      'payment_receipt',
      'payment_reminder',
    ]);
    const bad = validateOverrides('welcome_resident', { body: 'x' }, 'whatsapp');
    expect(bad.ok).toBe(false);
  });

  it('rejects variables that are not in the WhatsApp list, even ones valid for email', () => {
    expect(validateOverrides('payment_reminder', { body: 'Hi {{resident_name}} {{due_date}}' }, 'whatsapp')).toEqual({
      ok: true,
    });
    const bad = validateOverrides('payment_reminder', { body: 'At {{property}}' }, 'whatsapp');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.join(' ')).toContain('{{property}}');
  });

  it('rejects text over the Chatmaid limit and accepts text at it', () => {
    const at = 'a'.repeat(WHATSAPP_MAX_CONTENT_LENGTH);
    expect(validateOverrides('payment_receipt', { body: at }, 'whatsapp')).toEqual({ ok: true });
    const over = validateOverrides('payment_receipt', { body: `${at}a` }, 'whatsapp');
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.errors.join(' ')).toContain('4096');
  });

  it('WhatsApp and email defaults are kept apart', () => {
    expect(mergeEventContent('payment_receipt', {}, 'whatsapp')).toHaveProperty('body');
    expect(mergeEventContent('payment_receipt', {}, 'whatsapp')).not.toHaveProperty('subject');
  });
});

describe('updateEventContent for whatsapp', () => {
  let saved: { overrides?: Record<string, string> } | null;
  let filters: Array<[string, unknown]>;
  const row = { id: 'w1', display_name: 'Payment receipt (WhatsApp)', overrides: {} };

  beforeEach(() => {
    vi.clearAllMocks();
    saved = null;
    filters = [];
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (column: string, value: unknown) => {
      filters.push([column, value]);
      return chain;
    };
    chain.update = (values: { overrides: Record<string, string> }) => {
      saved = values;
      return chain;
    };
    chain.maybeSingle = async () => ({ data: row, error: null });
    chain.single = async () => ({ data: { ...row, overrides: saved?.overrides }, error: null });
    createServerSupabaseClient.mockResolvedValue({ from: () => chain });
    authorizePermission.mockResolvedValue({ authorized: true });
  });

  it('saves to the whatsapp row, audited, under notifications.manage', async () => {
    const result = await updateEventContent('payment_receipt', 'whatsapp', { body: 'Got {{amount}}' });
    expect(result.error).toBeNull();
    expect(authorizePermission).toHaveBeenCalledWith('notifications.manage');
    expect(filters).toContainEqual(['channel', 'whatsapp']);
    expect(saved?.overrides).toEqual({ body: 'Got {{amount}}' });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entityType: 'notification_templates', entityId: 'w1' })
    );
  });

  it('refuses an unknown variable or over-long text and writes nothing', async () => {
    const unknown = await updateEventContent('payment_receipt', 'whatsapp', { body: '{{house}}' });
    expect(unknown.error).toContain('{{house}}');
    const long = await updateEventContent('payment_receipt', 'whatsapp', { body: 'a'.repeat(4097) });
    expect(long.data).toBeNull();
    expect(saved).toBeNull();
    expect(logAudit).not.toHaveBeenCalled();
  });
});
