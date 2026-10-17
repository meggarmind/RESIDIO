'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { EstateMapHouse, EstateMapSnapshot, EstateMapStatus } from '@/types/estate-map';

// PostgREST caps a response at 1000 rows by default, so both reads page with .range.
const PAGE_SIZE = 1000;

type HouseRow = {
    id: string;
    house_number: string;
    street_id: string | null;
    streets: { name: string } | { name: string }[] | null;
};

type InvoiceRow = { house_id: string | null; status: string; due_date: string };

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function fetchAll<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await page(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE_SIZE) return rows;
    }
}

export async function getEstateMapStatus(): Promise<{
    data: EstateMapSnapshot | null;
    error: string | null;
}> {
    const auth = await authorizePermission(PERMISSIONS.BILLING_VIEW);
    if (!auth.authorized) {
        return { data: null, error: auth.error || 'Unauthorized' };
    }

    const supabase = await createServerSupabaseClient();

    try {
        const [houses, invoices] = await Promise.all([
            fetchAll<HouseRow>((from, to) =>
                supabase
                    .from('houses')
                    .select('id, house_number, street_id, streets(name)')
                    .eq('is_active', true)
                    .order('id')
                    .range(from, to) as unknown as Page<HouseRow>
            ),
            // void is excluded here, so voided invoices never affect a house's status.
            fetchAll<InvoiceRow>((from, to) =>
                supabase
                    .from('invoices')
                    .select('house_id, status, due_date')
                    .in('status', ['unpaid', 'partially_paid', 'paid'])
                    .not('house_id', 'is', null)
                    .order('id')
                    .range(from, to) as unknown as Page<InvoiceRow>
            ),
        ]);

        const today = new Date().toISOString().slice(0, 10);
        const state = new Map<string, EstateMapStatus>();
        for (const inv of invoices) {
            if (!inv.house_id) continue;
            const open = inv.status === 'unpaid' || inv.status === 'partially_paid';
            const current = state.get(inv.house_id);
            if (open) {
                // overdue is derived from due_date, it is not an invoice_status value.
                const next: EstateMapStatus = inv.due_date < today ? 'overdue' : 'outstanding';
                if (current !== 'overdue') state.set(inv.house_id, next);
            } else if (inv.status === 'paid' && !current) {
                state.set(inv.house_id, 'paid_up');
            }
        }

        const counts: Record<EstateMapStatus, number> = { paid_up: 0, outstanding: 0, overdue: 0, no_invoice: 0 };
        const result: EstateMapHouse[] = houses.map((h) => {
            const street = Array.isArray(h.streets) ? h.streets[0] : h.streets;
            const status = state.get(h.id) ?? 'no_invoice';
            counts[status]++;
            return {
                id: h.id,
                houseNumber: h.house_number,
                streetId: h.street_id,
                streetName: street?.name ?? null,
                status,
            };
        });

        const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
        result.sort(
            (a, b) =>
                collator.compare(a.streetName ?? '', b.streetName ?? '') ||
                collator.compare(a.houseNumber, b.houseNumber)
        );

        return { data: { houses: result, counts, asOf: new Date().toISOString() }, error: null };
    } catch (err) {
        console.error('[getEstateMapStatus] Failed to build estate map:', err);
        return {
            data: null,
            error:
                (err as { message?: string } | null)?.message || 'Failed to fetch estate map status',
        };
    }
}
