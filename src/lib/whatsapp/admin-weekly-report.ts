import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { sendEmail, getEstateEmailSettings } from '@/lib/email/send-email';
import { WhatsAppAdminWeeklyEmail, whatsAppAdminWeeklySubject, type WhatsAppAdminWeeklyRow } from '@/emails/whatsapp-admin-weekly';
import { WHATSAPP_ADMIN_ACTIONS } from '@/lib/whatsapp/admin';
import { formatDay, lagosMidnight, lagosParts } from '@/lib/whatsapp/assistant-format';

/**
 * Weekly email to every active Chairman listing the admin actions done on WhatsApp in the past
 * 7 days (#1298): who, which item, which house or resident, when. Sent even when the week is empty.
 */

/** Most rows the email shows; a busier week is cut with a note. */
export const WEEKLY_REPORT_MAX_ROWS = 200;

/** The last 7 whole Lagos days before today: `from` is inclusive, `to` (today's Lagos midnight) is not. */
export function weeklyWindow(now: Date): { from: Date; to: Date } {
  const { year, month, day } = lagosParts(now);
  return { from: lagosMidnight(year, month, day - 7), to: lagosMidnight(year, month, day) };
}

export interface WeeklyRequest {
  action: string;
  profileId: string;
  completedAt: string;
}

export interface WeeklyDisclosure {
  createdAt: string;
  adminProfileId: string | null;
  house: string;
  resident: string;
}

/**
 * Rows, oldest first. A house lookup (`owes`) is listed from its disclosure record, which names the
 * house and resident; every other done request is listed from the request.
 */
export function buildWeeklyRows(
  requests: WeeklyRequest[],
  disclosures: WeeklyDisclosure[],
  adminNames: Map<string, string>
): WhatsAppAdminWeeklyRow[] {
  const name = (id: string | null) => (id && adminNames.get(id)) || 'Unknown admin';
  const entries = [
    ...requests
      .filter((request) => request.action !== 'owes')
      .map((request) => ({
        at: request.completedAt,
        row: {
          date: formatDay(request.completedAt),
          admin: name(request.profileId),
          item: WHATSAPP_ADMIN_ACTIONS[request.action]?.label ?? request.action,
          target: '-',
          outcome: 'Done',
        },
      })),
    ...disclosures.map((disclosure) => ({
      at: disclosure.createdAt,
      row: {
        date: formatDay(disclosure.createdAt),
        admin: name(disclosure.adminProfileId),
        item: WHATSAPP_ADMIN_ACTIONS.owes?.label ?? 'Resident status',
        target: [disclosure.house, disclosure.resident].filter(Boolean).join(', ') || '-',
        outcome: 'Figures shown',
      },
    })),
  ];
  return entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).map((entry) => entry.row);
}

type Embedded<T> = T | T[] | null;
const first = <T>(value: Embedded<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value);

export async function runWeeklyAdminReport(now: Date = new Date()): Promise<{ recipients: number; rows: number; sent: boolean }> {
  const { from, to } = weeklyWindow(now);
  const db = createAdminClient() as unknown as SupabaseClient;

  const [requestResult, disclosureResult, chairmanResult] = await Promise.all([
    db.from('whatsapp_admin_requests').select('action, profile_id, completed_at').eq('status', 'done').gte('completed_at', from.toISOString()).lt('completed_at', to.toISOString()),
    db
      .from('whatsapp_disclosure_logs')
      .select('created_at, metadata, house:houses(short_name, house_number, street:streets(name)), resident:residents(first_name, last_name)')
      .eq('menu_item', 'admin_owes')
      .gte('created_at', from.toISOString())
      .lt('created_at', to.toISOString()),
    db.from('profiles').select('id, full_name, email, app_roles!profiles_role_id_fkey!inner(name)').eq('approval_status', 'active').eq('app_roles.name', 'chairman'),
  ]);
  for (const result of [requestResult, disclosureResult, chairmanResult]) if (result.error) throw result.error;

  const requests: WeeklyRequest[] = (requestResult.data || []).map((row) => ({ action: row.action, profileId: row.profile_id, completedAt: row.completed_at }));
  const disclosures: WeeklyDisclosure[] = (disclosureResult.data || []).map((row) => {
    const house = first<{ short_name: string | null; house_number: string; street: Embedded<{ name: string }> }>(row.house);
    const resident = first<{ first_name: string; last_name: string }>(row.resident);
    const street = house ? first(house.street)?.name : null;
    return {
      createdAt: row.created_at,
      adminProfileId: (row.metadata as { admin_profile_id?: string } | null)?.admin_profile_id ?? null,
      house: house ? house.short_name || `${house.house_number}, ${street || 'Estate'}` : '',
      resident: resident ? `${resident.first_name} ${resident.last_name}`.trim() : '',
    };
  });

  const ids = [...new Set([...requests.map((r) => r.profileId), ...disclosures.map((d) => d.adminProfileId).filter((id): id is string => !!id)])];
  const adminNames = new Map<string, string>();
  if (ids.length > 0) {
    const { data, error } = await db.from('profiles').select('id, full_name').in('id', ids);
    if (error) throw error;
    for (const profile of data || []) adminNames.set(profile.id, profile.full_name);
  }

  const all = buildWeeklyRows(requests, disclosures, adminNames);
  const rows = all.slice(0, WEEKLY_REPORT_MAX_ROWS);
  const periodLabel = `${formatDay(from)} to ${formatDay(new Date(to.getTime() - 1))}`;
  const chairmen = (chairmanResult.data || []).filter((profile) => profile.email?.trim());
  if (chairmen.length === 0) return { recipients: 0, rows: all.length, sent: false };

  const estate = await getEstateEmailSettings();
  let sent = false;
  for (const chairman of chairmen) {
    const result = await sendEmail({
      to: { email: chairman.email.trim(), name: chairman.full_name },
      subject: whatsAppAdminWeeklySubject(periodLabel),
      react: WhatsAppAdminWeeklyEmail({
        firstName: chairman.full_name.split(' ')[0] || chairman.full_name,
        periodLabel,
        rows,
        omitted: all.length - rows.length,
        ...estate,
      }),
      emailType: 'notification',
      metadata: { purpose: 'whatsapp_admin_weekly', rows: all.length },
    });
    if (!result.success) throw new Error(result.error || 'WhatsApp admin weekly email failed');
    sent = true;
  }
  return { recipients: chairmen.length, rows: all.length, sent };
}
