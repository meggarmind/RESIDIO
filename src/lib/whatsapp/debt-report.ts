import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { createAdminClient } from '@/lib/supabase/server';
import { getRawSettingsAsService } from '@/lib/settings/service';
import { getEstateEmailSettings } from '@/lib/email/send-email';
import { getDebtStatuses, readDebtStatusSettings } from '@/lib/billing/debt-status';
import { addToQueue, PRIORITY } from '@/lib/notifications/queue';
import { DebtStatusPdf, type DebtStatusPdfRow } from '@/lib/pdf/reports/debt-status-pdf';
import { formatPdfDate } from '@/lib/pdf/format-date';
import { sendWhatsAppMessage } from '@/lib/whatsapp/provider';
import type { NotificationQueueItem } from '@/lib/notifications/types';
import { WhatsAppDebtReportEmail } from '@/emails/whatsapp-debt-report';

/**
 * WhatsApp admin debt status report (#982): a PDF of every reportable house with its debt status and
 * no amounts or resident names. The status comes from the shared function (getDebtStatuses, #980).
 */

/** Houses in these states are left out, with unverified identifiers and houses without an active primary resident. */
export const DEBT_REPORT_EXCLUDED_PROPERTY_STATUSES = ['vacant', 'under_renovation', 'under_construction'];

/** The primary resident roles, as get_debt_statuses picks the house's resident. */
export const DEBT_REPORT_PRIMARY_ROLES = ['tenant', 'resident_landlord', 'non_resident_landlord'];

export const DEBT_REPORT_FAILED_REPLY = 'The debt status report could not be made, so nothing was sent. Try again later.';

export interface DebtReportHouse {
  id: string;
  houseCode: string;
  streetId: string;
  streetName: string;
}

interface HouseRow {
  id: string;
  house_number: string;
  short_name: string | null;
  identifier_unverified: boolean;
  property_status: string;
  is_active: boolean;
  street: { id: string; name: string } | { id: string; name: string }[] | null;
  resident_houses: { is_active: boolean; resident_role: string }[] | null;
}

/** The report's eligibility rule: an active, verified, lived-in house with an active primary resident. */
export function isReportableHouse(row: HouseRow): boolean {
  return (
    row.is_active &&
    !row.identifier_unverified &&
    !DEBT_REPORT_EXCLUDED_PROPERTY_STATUSES.includes(row.property_status) &&
    (row.resident_houses ?? []).some((link) => link.is_active && DEBT_REPORT_PRIMARY_ROLES.includes(link.resident_role))
  );
}

const byName = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

/** Reportable houses, ordered by street then house number. */
export async function loadReportableHouses(): Promise<DebtReportHouse[]> {
  const { data, error } = await createAdminClient()
    .from('houses')
    .select('id, house_number, short_name, identifier_unverified, property_status, is_active, street:streets(id, name), resident_houses(is_active, resident_role)')
    .eq('is_active', true)
    .range(0, 4999);
  if (error) throw new Error(`Debt report houses could not be read: ${error.message}`);
  return ((data ?? []) as unknown as HouseRow[])
    .filter(isReportableHouse)
    .flatMap((row) => {
      const street = Array.isArray(row.street) ? row.street[0] : row.street;
      return street ? [{ id: row.id, houseCode: row.short_name?.trim() || row.house_number, streetId: street.id, streetName: street.name }] : [];
    })
    .sort((a, b) => byName(a.streetName, b.streetName) || byName(a.houseCode, b.houseCode));
}

export interface DebtReportStreetOption {
  number: number;
  id: string;
  name: string;
  houseCount: number;
}

/** Streets with at least one reportable house, numbered from 1 in name order. */
export function streetOptions(houses: DebtReportHouse[]): DebtReportStreetOption[] {
  const counts = new Map<string, DebtReportStreetOption>();
  for (const house of houses) {
    const entry = counts.get(house.streetId);
    if (entry) entry.houseCount += 1;
    else counts.set(house.streetId, { number: 0, id: house.streetId, name: house.streetName, houseCount: 1 });
  }
  return [...counts.values()].sort((a, b) => byName(a.name, b.name)).map((option, i) => ({ ...option, number: i + 1 }));
}

export type StreetChoice = { all: true } | { all: false; numbers: number[] };

/** `ALL`, or street numbers such as `2,3` or `2 3`; null for anything else. */
export function parseStreetChoice(text: string | null | undefined): StreetChoice | null {
  const value = (text || '').trim();
  if (/^all$/i.test(value)) return { all: true };
  if (!/^\d{1,3}([\s,]+\d{1,3})*$/.test(value)) return null;
  return { all: false, numbers: [...new Set(value.split(/[\s,]+/).map(Number))] };
}

/**
 * Up to the limit goes in chat, more by email; the limit itself still fits in chat. Chat needs WhatsApp
 * document sending (#917), which no provider has yet, so the admin action sends every report by email
 * and starts using this when it lands.
 */
export function deliveryFor(houseCount: number, chatLimit: number): 'chat' | 'email' {
  return houseCount <= chatLimit ? 'chat' : 'email';
}

export interface DebtReportScope {
  all: boolean;
  streetIds: string[];
}

export function scopeLabel(scope: DebtReportScope, options: DebtReportStreetOption[]): string {
  if (scope.all) return 'Whole estate';
  return options.filter((o) => scope.streetIds.includes(o.id)).map((o) => o.name).join(', ');
}

async function loadScope(scope: DebtReportScope) {
  const all = await loadReportableHouses();
  return {
    houses: scope.all ? all : all.filter((house) => scope.streetIds.includes(house.streetId)),
    scopeLabel: scopeLabel(scope, streetOptions(all)),
  };
}

/** How many houses the report for a scope covers, read the same way the report reads them. */
export async function countDebtReportHouses(scope: DebtReportScope): Promise<{ houseCount: number; scopeLabel: string }> {
  const { houses, scopeLabel: label } = await loadScope(scope);
  return { houseCount: houses.length, scopeLabel: label };
}

/** The report PDF for a scope; throws when the data cannot be read or the PDF cannot be drawn. */
export async function renderDebtStatusReport(scope: DebtReportScope): Promise<{ pdf: Buffer; houseCount: number; scopeLabel: string }> {
  const admin = createAdminClient();
  const { houses, scopeLabel: label } = await loadScope(scope);
  const [statuses, settings, estate] = await Promise.all([
    getDebtStatuses(admin, { houseIds: houses.map((house) => house.id) }),
    readDebtStatusSettings(admin),
    getRawSettingsAsService(['estate_name']),
  ]);
  const labelByHouse = new Map(statuses.map((s) => [s.houseId, s.label]));
  const rows: DebtStatusPdfRow[] = houses.flatMap((house) => {
    const status = labelByHouse.get(house.id);
    return status ? [{ street: house.streetName, house: house.houseCode, status }] : [];
  });
  const name = estate.status === 'ok' ? estate.values.get('estate_name') : null;
  const pdf = await renderToBuffer(
    DebtStatusPdf({
      data: {
        estateName: typeof name === 'string' && name.trim() ? name.trim() : 'Residio Estate',
        generatedOn: formatPdfDate(new Date()),
        scopeLabel: label,
        footnote: settings.reportFootnote,
        rows,
      },
    }),
  );
  return { pdf, houseCount: rows.length, scopeLabel: label };
}

/** Queues the report email to the admin's account address; the PDF is drawn when the queue sends it. */
export async function queueDebtReportEmail(input: { profileId: string; email: string; fullName: string; phoneNumber: string; scope: DebtReportScope; scopeLabel: string }): Promise<void> {
  const queued = await addToQueue({
    recipient_id: null,
    recipient_email: input.email,
    channel: 'email',
    subject: 'Debt status report',
    body: 'Your debt status report is attached.',
    priority: PRIORITY.NORMAL,
    metadata: {
      admin_profile_id: input.profileId,
      admin_name: input.fullName,
      admin_phone_number: input.phoneNumber,
      whatsapp_debt_report: { ...input.scope, scopeLabel: input.scopeLabel },
    },
  });
  if (!queued.success) throw new Error(`Debt report email could not be queued: ${queued.error}`);
}

/** The email body and PDF attachment for a queued debt report, built at send time. */
export async function buildDebtReportEmail(metadata: Record<string, unknown>) {
  const request = metadata.whatsapp_debt_report as (DebtReportScope & { scopeLabel?: string }) | undefined;
  if (!request || !Array.isArray(request.streetIds)) throw new Error('Debt report request is malformed');
  const { pdf, scopeLabel: label } = await renderDebtStatusReport({ all: request.all === true, streetIds: request.streetIds });
  const estate = await getEstateEmailSettings();
  const fullName = typeof metadata.admin_name === 'string' ? metadata.admin_name : 'there';
  return {
    react: createElement(WhatsAppDebtReportEmail, {
      firstName: fullName.split(' ')[0] || fullName,
      ...estate,
      scopeLabel: label,
    }),
    attachments: [{ filename: `debt-status-${new Date().toISOString().slice(0, 10)}.pdf`, content: pdf }],
  };
}

/** Tells the admin on their linked WhatsApp number that a queued report could not be made or emailed. Never a text version of the report. */
export async function replyDebtReportFailed(item: NotificationQueueItem): Promise<void> {
  const to = item.metadata?.admin_phone_number;
  if (typeof to !== 'string' || !to) {
    console.error('[whatsapp-debt-report] Failed report has no admin number to tell:', { queueId: item.id });
    return;
  }
  try {
    const result = await sendWhatsAppMessage({ to, body: DEBT_REPORT_FAILED_REPLY, idempotencySeed: `${item.id}:debt-report-failed` });
    if (!result.success) console.error('[whatsapp-debt-report] Failure reply could not be sent:', { queueId: item.id, error: result.error });
  } catch (error) {
    console.error('[whatsapp-debt-report] Failure reply could not be sent:', { queueId: item.id, error });
  }
}
