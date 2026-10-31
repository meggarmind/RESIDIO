import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizePermission } from '@/lib/auth/authorize';
import { createAdminClient } from '@/lib/supabase/server';
import { getWhatsAppClearanceCopyFailures, getWhatsAppDeliveryProblems, getWhatsAppDisclosureLogs, getWhatsAppHealth, getWhatsAppOutboundSends, getWhatsAppSessions, getWhatsAppStatementFlags, getWhatsAppSurveySummary, retryWhatsAppClearanceCopy } from '../admin-console';
import { logAudit } from '@/lib/audit/logger';
import { retryClearanceCopy } from '@/lib/clearance/issue-certificate';
import { filterDisclosureLogs, filterOptIns } from '@/app/(dashboard)/(oversight)/system/whatsapp-monitoring/activity-logs';

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/auth/action-roles', () => ({ PERMISSIONS: { WHATSAPP_VIEW: 'whatsapp.view', WHATSAPP_MANAGE: 'whatsapp.manage' } }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/clearance/issue-certificate', () => ({ retryClearanceCopy: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const authMock = vi.mocked(authorizePermission);
const clientMock = vi.mocked(createAdminClient);
const authorized = { authorized: true, userId: 'admin-1', role: null, roleName: null, roleId: null, permissions: [], error: null };
const unauthorized = { authorized: false, userId: null, role: null, roleName: null, roleId: null, permissions: [], error: 'Forbidden' };

type QueryResult = { data: unknown; error: unknown; count?: number };

function chain(result: QueryResult) {
  const value: QueryResult = { ...result };
  const query = {} as Record<string, ReturnType<typeof vi.fn>>;
  for (const method of ['select', 'eq', 'gte', 'order', 'limit', 'ilike', 'or', 'range']) query[method] = vi.fn().mockReturnValue(query);
  query.then = vi.fn((resolve: (result: QueryResult) => unknown) => Promise.resolve(resolve(value)));
  return query;
}

/** Splits a PostgREST select string into its top-level columns/embeds, ignoring commas inside parentheses. */
function topLevelColumns(select: string) {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of select) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

describe('WhatsApp operations console actions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fails closed before creating a client for protected reads', async () => {
    authMock.mockResolvedValue(unauthorized);
    expect((await getWhatsAppSessions()).error).toBe('Forbidden');
    expect((await getWhatsAppDisclosureLogs()).error).toBe('Forbidden');
    expect((await getWhatsAppHealth()).error).toBe('Forbidden');
    expect((await getWhatsAppDeliveryProblems()).error).toBe('Forbidden');
    expect((await getWhatsAppStatementFlags()).error).toBe('Forbidden');
    expect((await getWhatsAppClearanceCopyFailures()).error).toBe('Forbidden');
    expect((await getWhatsAppSurveySummary()).error).toBe('Forbidden');
    expect((await getWhatsAppOutboundSends()).error).toBe('Forbidden');
    expect(clientMock).not.toHaveBeenCalled();
  });

  it('returns session and disclosure projections without financial fields', async () => {
    authMock.mockResolvedValue(authorized);
    const session = chain({ data: [{ phone_number: '+2348000000000', current_node: 'menu' }], error: null });
    const disclosure = chain({ data: [{ phone_number: '+2348000000000', menu_item: 'balance' }], error: null });
    clientMock.mockReturnValue({ from: vi.fn().mockReturnValueOnce(session).mockReturnValueOnce(disclosure) } as never);
    const sessions = await getWhatsAppSessions();
    const disclosures = await getWhatsAppDisclosureLogs();
    expect(sessions.data?.[0]).toEqual(expect.objectContaining({ current_node: 'menu' }));
    expect(disclosures.data?.[0]).toEqual(expect.objectContaining({ menu_item: 'balance' }));
    // The projection is defined by the column list the action selects, not by the mocked rows.
    const financial = /amount|balance|outstanding|paid|owed|wallet|invoice|price|total/i;
    for (const query of [session, disclosure]) {
      const columns = topLevelColumns(String(query.select.mock.calls[0][0]));
      expect(columns.length).toBeGreaterThan(5);
      expect(columns.filter((column) => financial.test(column))).toEqual([]);
    }
  });

  it('lists statements waiting for an email, with no financial fields (#804)', async () => {
    authMock.mockResolvedValue(authorized);
    const query = chain({ data: [{ id: 'r1', status: 'awaiting_email' }], error: null });
    const from = vi.fn().mockReturnValue(query);
    clientMock.mockReturnValue({ from } as never);

    const flags = await getWhatsAppStatementFlags();

    expect(flags.data).toEqual([{ id: 'r1', status: 'awaiting_email' }]);
    expect(from).toHaveBeenCalledWith('whatsapp_statement_requests');
    expect(query.eq).toHaveBeenCalledWith('status', 'awaiting_email');
    const columns = topLevelColumns(String(query.select.mock.calls[0][0]));
    expect(columns.filter((column) => /amount|balance|outstanding|paid|owed|wallet|invoice|total/i.test(column))).toEqual([]);
  });

  it('aggregates health counters from existing WhatsApp records', async () => {
    authMock.mockResolvedValue(authorized);
    const counts = [4, 6, 1, 2, 3, 5].map((count) => chain({ data: null, error: null, count }));
    clientMock.mockReturnValue({ from: vi.fn().mockImplementation(() => counts.shift()) } as never);
    const result = await getWhatsAppHealth();
    expect(result.data).toEqual({ inboundToday: 4, outboundToday: 6, deliveryFailuresToday: 1, templateErrorsToday: 3, capLimitEventsToday: 5 });
  });

  it('counts the last 30 days of survey scores and reasons, with no comments or names (#872)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T12:00:00.000Z'));
    authMock.mockResolvedValue(authorized);
    const query = chain({
      data: [
        { score: 'good', reason: null },
        { score: 'good', reason: null },
        { score: 'okay', reason: null },
        { score: 'poor', reason: 'too_slow' },
        { score: 'poor', reason: 'other' },
        { score: 'poor', reason: 'other' },
        { score: null, reason: null },
      ],
      error: null,
    });
    const from = vi.fn().mockReturnValue(query);
    clientMock.mockReturnValue({ from } as never);

    const result = await getWhatsAppSurveySummary();

    expect(from).toHaveBeenCalledWith('whatsapp_survey_responses');
    expect(query.gte).toHaveBeenCalledWith('asked_at', '2026-09-20T12:00:00.000Z');
    expect(String(query.select.mock.calls[0][0])).toBe('score, reason');
    expect(result.data).toEqual({
      asked: 7,
      byScore: { good: 2, okay: 1, poor: 3 },
      byReason: { too_slow: 1, not_found: 0, wrong_information: 0, other: 2 },
    });
    vi.useRealTimers();
  });

  it('lists failed sends and Chatmaid sends unconfirmed past 15 minutes, with the resident (#839)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-10-20T12:00:00.000Z'));
    authMock.mockResolvedValue(authorized);
    const problems = chain({ data: [{ id: 'send-1', status: 'failed' }], error: null });
    clientMock.mockReturnValue({ from: vi.fn().mockReturnValue(problems) } as never);

    const result = await getWhatsAppDeliveryProblems();

    expect(result.data).toEqual([{ id: 'send-1', status: 'failed' }]);
    expect(String(problems.select.mock.calls[0][0])).toMatch(/inbound_message_id.*resident:residents\(/);
    expect(problems.or).toHaveBeenCalledWith('status.eq.failed,and(status.eq.pending,provider.in.(chatmaid,waha),created_at.lt.2026-10-20T11:45:00.000Z)');
    vi.useRealTimers();
  });

  it('lists every outbound send, replies and notifications, newest first, with only the last 4 digits (#923)', async () => {
    authMock.mockResolvedValue(authorized);
    const sends = chain({
      data: [
        { id: 's1', purpose: 'inbound_reply', phone_number: '+2348031234567', status: 'delivered', error_code: null, inbound_message_id: 'm1', created_at: '2026-10-21T10:00:00Z', resident: null },
        { id: 's2', purpose: 'notification', phone_number: '+2348039876543', status: 'failed', error_code: '131026', inbound_message_id: null, created_at: '2026-10-21T09:00:00Z', resident: null },
      ],
      error: null,
      count: 40,
    });
    clientMock.mockReturnValue({ from: vi.fn().mockReturnValue(sends) } as never);

    const result = await getWhatsAppOutboundSends({ status: 'failed', purpose: 'notification', page: 1 });

    expect(result.data?.total).toBe(40);
    expect(result.data?.rows.map((row) => [row.purpose, row.maskedPhone])).toEqual([['inbound_reply', '****4567'], ['notification', '****6543']]);
    expect(JSON.stringify(result.data)).not.toMatch(/803123|phone_number|message_text/);
    expect(sends.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(sends.eq).toHaveBeenCalledWith('status', 'failed');
    expect(sends.eq).toHaveBeenCalledWith('purpose', 'notification');
    expect(sends.range).toHaveBeenCalledWith(25, 49);
  });

  it('ignores unknown outbound send filters instead of passing them to the query (#923)', async () => {
    authMock.mockResolvedValue(authorized);
    const sends = chain({ data: [], error: null, count: 0 });
    clientMock.mockReturnValue({ from: vi.fn().mockReturnValue(sends) } as never);
    await getWhatsAppOutboundSends({ status: 'x,or(1=1)', purpose: 'bogus' });
    expect(sends.eq).not.toHaveBeenCalled();
  });

  it('lists clearance certificate copies that failed, with the recipient and the certificate (#816)', async () => {
    authMock.mockResolvedValue(authorized);
    const query = chain({ data: [{ id: 'copy-1', error: 'not opted in', attempts: 1 }], error: null });
    clientMock.mockReturnValue({ from: vi.fn().mockReturnValue(query) } as never);

    const result = await getWhatsAppClearanceCopyFailures();

    expect(result.data).toEqual([{ id: 'copy-1', error: 'not opted in', attempts: 1 }]);
    expect(String(query.select.mock.calls[0][0])).toMatch(/recipient:residents\(.*document:documents\(title\)/);
    expect(query.eq).toHaveBeenCalledWith('status', 'failed');
  });

  it('retries a failed clearance copy for a manager, and audits the retry', async () => {
    authMock.mockResolvedValue(authorized);
    vi.mocked(retryClearanceCopy).mockResolvedValue({ sent: true, documentId: 'doc-1' });

    expect(await retryWhatsAppClearanceCopy('copy-1')).toEqual({ success: true, data: null, error: null });
    expect(authMock).toHaveBeenCalledWith('whatsapp.manage');
    expect(retryClearanceCopy).toHaveBeenCalledWith('copy-1');
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE', entityType: 'documents', entityId: 'doc-1', newValues: { retried: true, copyId: 'copy-1', sent: true } }));
  });

  it('reports why a retried copy still did not send, and refuses without whatsapp.manage', async () => {
    authMock.mockResolvedValue(authorized);
    vi.mocked(retryClearanceCopy).mockResolvedValue({ sent: false, reason: 'not opted in' });
    expect(await retryWhatsAppClearanceCopy('copy-1')).toMatchObject({ success: false, error: 'Not sent: not opted in' });

    vi.clearAllMocks();
    authMock.mockResolvedValue(unauthorized);
    expect(await retryWhatsAppClearanceCopy('copy-1')).toMatchObject({ success: false, error: 'Forbidden' });
    expect(retryClearanceCopy).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('does not throw when the retry itself fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    authMock.mockResolvedValue(authorized);
    vi.mocked(retryClearanceCopy).mockRejectedValue(new Error('storage down'));
    expect(await retryWhatsAppClearanceCopy('copy-1')).toMatchObject({ success: false });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('filters opt-ins and disclosures by admin-visible fields', () => {
    const person = { first_name: 'Ada', last_name: 'Okoro', resident_code: 'RES001' };
    const optIns = [{ resident_id: 'resident-1', phone_number: '+2348000000000', opted_in: true, source: 'admin', opted_in_at: null, opted_out_at: null, updated_at: '2026-08-24T00:00:00Z', resident: person }];
    const disclosures = [{ phone_number: '+2348000000000', menu_item: 'balance', pin_authenticated: true, created_at: '2026-08-24T10:00:00Z', resident: person, house: null }];
    expect(filterOptIns(optIns, 'res001', 'opted_in')).toHaveLength(1);
    expect(filterOptIns(optIns, 'res001', 'opted_out')).toHaveLength(0);
    const deactivated = [{ ...optIns[0], deactivated_at: '2026-10-20T00:00:00Z' }];
    expect(filterOptIns(deactivated, 'res001', 'opted_in')).toHaveLength(0);
    expect(filterOptIns(deactivated, 'res001', 'deactivated')).toHaveLength(1);
    expect(filterDisclosureLogs(disclosures, 'balance', '2026-08-24')).toHaveLength(1);
    expect(filterDisclosureLogs(disclosures, 'balance', '2026-08-23')).toHaveLength(0);
  });
});
