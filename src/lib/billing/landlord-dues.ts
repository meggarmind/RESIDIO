import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_CHARGE_CATEGORY } from '@/lib/billing/charge-categories';
import { resolvePayer } from '@/lib/billing/payer';
import { formatDay } from '@/lib/whatsapp/assistant-format';

/**
 * House setting "Dues paid by landlord" (#1192, owner decision 7 of #1188): the tenant still owes
 * the dues and the landlord pays them. Pure rules and the landlord lookup shared by the reminder
 * run, the split and the receipts.
 */

export const DUES_REMINDER_TARGETS = ['tenant', 'landlord', 'both'] as const;
export type DuesReminderTarget = (typeof DUES_REMINDER_TARGETS)[number];

export const DUES_REMINDER_TARGET_LABELS: Record<DuesReminderTarget, string> = {
    tenant: 'Tenant only',
    landlord: 'Landlord only',
    both: 'Tenant and landlord',
};

export type HouseDuesSetting = {
    dues_paid_by_landlord?: boolean | null;
    dues_reminder_target?: string | null;
};

/** Who gets the reminder for one invoice. Only Dues invoices of a flagged house can go to the landlord. */
export function duesReminderRecipients(
    house: HouseDuesSetting | null | undefined,
    chargeCategory: string | null | undefined,
): { tenant: boolean; landlord: boolean } {
    if (!house?.dues_paid_by_landlord || (chargeCategory || DEFAULT_CHARGE_CATEGORY) !== DEFAULT_CHARGE_CATEGORY) {
        return { tenant: true, landlord: false };
    }
    const target = house.dues_reminder_target;
    return { tenant: target !== 'landlord', landlord: target === 'landlord' || target === 'both' };
}

export type DuesContact = {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone_primary: string | null;
};

/** The landlord of each house, by the same rule billing uses for a landlord charge (resolvePayer). */
export async function findHouseLandlords(
    client: SupabaseClient,
    houseIds: string[],
): Promise<{ data: Map<string, DuesContact>; error: string | null }> {
    const landlords = new Map<string, DuesContact>();
    if (houseIds.length === 0) return { data: landlords, error: null };
    const { data, error } = await client
        .from('resident_houses')
        .select('house_id, resident_role, resident:residents!resident_houses_resident_id_fkey(id, first_name, last_name, email, phone_primary)')
        .in('house_id', houseIds)
        .eq('is_active', true);
    if (error) return { data: landlords, error: error.message };

    for (const houseId of houseIds) {
        const residents = (data || []).flatMap((link) => {
            const resident = (Array.isArray(link.resident) ? link.resident[0] : link.resident) as DuesContact | null;
            return link.house_id === houseId && resident ? [{ ...resident, role: String(link.resident_role) }] : [];
        });
        const { payer } = resolvePayer({
            payer: 'landlord',
            targetType: 'house',
            house: { vacant: false, newNeverOccupied: false },
            applicableRoles: null,
            residents,
        });
        if (payer) landlords.set(houseId, payer);
    }
    return { data: landlords, error: null };
}

export type DuesLine = { label: string; amount: number };

export function formatNgn(amount: number): string {
    return `NGN ${amount.toLocaleString('en-NG')}`;
}

/** `F1, Main Street NGN 50,000; F2, Main Street NGN 50,000`: the amount per flat in one line. */
export function formatDuesLines(lines: DuesLine[]): string {
    return lines.map((line) => `${line.label} ${formatNgn(line.amount)}`).join('; ');
}

/** `Jan 2026` for a period start, so a month is always a name (CORE.md section 4). */
export function monthLabel(periodStart: string): string {
    return formatDay(periodStart).split(' ').slice(1).join(' ');
}

/**
 * The months a payment of `amount` covers, spent over the invoices oldest first as the wallet
 * settlement spends it. A partly paid month is listed.
 */
export function coveredMonths(
    invoices: Array<{ period_start: string | null; amount_due: number; amount_paid: number }>,
    amount: number,
): string[] {
    let left = amount;
    const months: string[] = [];
    for (const invoice of invoices) {
        if (left <= 0) break;
        const owed = Number(invoice.amount_due) - Number(invoice.amount_paid);
        if (owed <= 0 || !invoice.period_start) continue;
        const month = monthLabel(invoice.period_start);
        if (!months.includes(month)) months.push(month);
        left -= owed;
    }
    return months;
}

/** "Jan 2026, Feb 2026 and Mar 2026". */
export function joinMonths(months: string[]): string {
    if (months.length <= 1) return months[0] || '';
    return `${months.slice(0, -1).join(', ')} and ${months[months.length - 1]}`;
}
