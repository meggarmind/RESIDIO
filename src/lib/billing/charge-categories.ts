/**
 * Charge categories (#1189): what a charge is for. Each resident has one wallet per category,
 * and a wallet pays only invoices of its own category. The list lives in public.charge_categories.
 */

/** The category of every charge and wallet that does not name one. */
export const DEFAULT_CHARGE_CATEGORY = 'dues';

export type ChargeCategory = {
    code: string;
    name: string;
    sort_order: number;
};

type InvoiceCategoryClient = {
    from: (table: 'invoices') => {
        select: (columns: 'charge_category') => {
            eq: (column: 'id', value: string) => {
                maybeSingle: () => PromiseLike<{ data: { charge_category: string } | null }>;
            };
        };
    };
};

/** What a payment for this invoice is for (#1190): the invoice's category, Dues when there is none. */
export async function invoiceChargeCategory(client: unknown, invoiceId: string | null | undefined): Promise<string> {
    if (!invoiceId) return DEFAULT_CHARGE_CATEGORY;
    const { data } = await (client as InvoiceCategoryClient)
        .from('invoices')
        .select('charge_category')
        .eq('id', invoiceId)
        .maybeSingle();
    return data?.charge_category || DEFAULT_CHARGE_CATEGORY;
}
