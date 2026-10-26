/**
 * The invoices a payment settles (#1190): unpaid or part-paid invoices of the resident in the payment's
 * charge category, inside the payment's house when it names one, started by the settlement date,
 * oldest first. Credit notes (negative amounts) are left out.
 */
export async function eligibleSettlementInvoiceIds(
    client: unknown,
    filter: { residentId: string; houseId?: string | null; chargeCategory: string; settlementDate: string },
): Promise<{ ids: string[]; error: string | null }> {
    // Typed loosely so the service-role and the cookie client can both be passed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (client as any)
        .from('invoices')
        .select('id, period_start, due_date')
        .eq('resident_id', filter.residentId)
        .eq('charge_category', filter.chargeCategory)
        .in('status', ['unpaid', 'partially_paid'])
        .gte('amount_due', 0)
        .lte('period_start', filter.settlementDate);
    if (filter.houseId) query = query.eq('house_id', filter.houseId);
    const { data, error } = await query.order('period_start', { ascending: true }).order('due_date', { ascending: true });
    if (error) return { ids: [], error: error.message };
    return { ids: ((data || []) as Array<{ id: string }>).map((invoice) => invoice.id), error: null };
}
