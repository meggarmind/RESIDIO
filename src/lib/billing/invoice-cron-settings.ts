/**
 * Server-only reader for the invoice cron's two settings (#641).
 *
 * Deliberately NOT a server-action module (no directive): it uses the admin
 * (service-role) client and must never be reachable as a client-callable server
 * action. Sole caller is the CRON_SECRET-authenticated route
 * `/api/cron/generate-invoices`, which is responsible for authentication.
 *
 * Why not `getAutoGenerateEnabled()` / `getInvoiceGenerationDay()`: those build the
 * SESSION client. A cron request has no session, and `system_settings` is readable
 * only by `authenticated`, so they always read zero rows and silently return the
 * defaults - the off switch and a changed generation day were ignored.
 *
 * Semantics: a missing row yields the UI default; a present value is parsed exactly
 * as the actions parse it; a query error THROWS (fail closed) so billing never
 * proceeds on an unreadable off switch.
 */

import { createAdminClient } from '@/lib/supabase/server';

export interface InvoiceCronSettings {
    autoGenerate: boolean;
    generationDay: number;
}

const DEFAULT_AUTO_GENERATE = true;
const DEFAULT_GENERATION_DAY = 2;

export async function getInvoiceCronSettings(): Promise<InvoiceCronSettings> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('system_settings')
        .select('key, value')
        .in('key', ['auto_generate_invoices', 'invoice_generation_day']);

    if (error) {
        throw new Error(`Failed to read invoice cron settings: ${error.message}`);
    }

    const rows = (data ?? []) as Array<{ key: string; value: unknown }>;
    const autoRow = rows.find((r) => r.key === 'auto_generate_invoices');
    const dayRow = rows.find((r) => r.key === 'invoice_generation_day');

    // Same parsing as getAutoGenerateEnabled / getInvoiceGenerationDay.
    const autoGenerate = autoRow
        ? autoRow.value === true || autoRow.value === 'true'
        : DEFAULT_AUTO_GENERATE;
    const generationDay = dayRow
        ? parseInt(String(dayRow.value).replace(/"/g, '')) || DEFAULT_GENERATION_DAY
        : DEFAULT_GENERATION_DAY;

    return { autoGenerate, generationDay };
}
