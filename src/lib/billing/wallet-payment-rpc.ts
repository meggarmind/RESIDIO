type RpcClient = {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{
        data: unknown;
        error: { message: string } | null;
    }>;
};

export function callWalletPaymentRpc(
    client: unknown,
    args: Record<string, unknown>,
) {
    return (client as RpcClient).rpc(
        'p_request_key' in args ? 'settle_wallet_invoices_idempotent' : 'settle_wallet_invoices',
        args,
    );
}

export type WalletInvoiceRpcName =
    | 'pay_invoice_with_wallet'
    | 'pay_invoices_with_wallet'
    | 'reverse_invoice_payment_allocation';

/** Atomic invoice/wallet RPCs from migration 20261012220000 (#458). Authorization lives in SQL. */
export function callWalletInvoiceRpc(
    client: unknown,
    name: WalletInvoiceRpcName,
    args: Record<string, unknown>,
) {
    return (client as RpcClient).rpc(name, args);
}

export function callWalletPaymentBatchReversal(
    client: unknown,
    args: Record<string, unknown>,
) {
    return (client as RpcClient).rpc('reverse_wallet_payment_batch', args);
}
