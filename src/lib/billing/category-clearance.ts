/**
 * Net a resident's wallets against their unpaid invoices one charge category at a time (#1189).
 * A wallet only pays invoices of its own category, so credit in one category cannot offset a
 * deficit in another: the resident is cleared only when no category is short.
 */
export function netClearanceByCategory(
    walletBalances: Record<string, number>,
    unpaidByCategory: Record<string, number>,
): { canProceed: boolean; netBalance: number } {
    let shortfall = 0;
    let surplus = 0;
    for (const category of new Set([...Object.keys(walletBalances), ...Object.keys(unpaidByCategory)])) {
        const net = (walletBalances[category] || 0) - (unpaidByCategory[category] || 0);
        if (net < 0) shortfall -= net;
        else surplus += net;
    }
    return shortfall > 0 ? { canProceed: false, netBalance: -shortfall } : { canProceed: true, netBalance: surplus };
}
