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
    return (client as RpcClient).rpc('settle_wallet_invoices', args);
}

export function callWalletPaymentBatchReversal(
    client: unknown,
    args: Record<string, unknown>,
) {
    return (client as RpcClient).rpc('reverse_wallet_payment_batch', args);
}
