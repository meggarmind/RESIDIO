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

export function callWalletPaymentBatchReversal(
    client: unknown,
    args: Record<string, unknown>,
) {
    return (client as RpcClient).rpc('reverse_wallet_payment_batch', args);
}
