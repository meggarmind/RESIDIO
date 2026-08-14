'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { getWalletBatchReconciliation, type WalletBatchReconciliationResult } from '@/actions/billing/get-wallet-batch-reconciliation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function WalletBatchReconciliationPanel() {
    const [result, setResult] = useState<WalletBatchReconciliationResult | null>(null);
    const [isScanning, setIsScanning] = useState(false);

    const handleScan = async () => {
        setIsScanning(true);
        const response = await getWalletBatchReconciliation({ limit: 200 });
        setIsScanning(false);
        if (response.error || !response.data) {
            toast.error(response.error || 'Wallet reconciliation failed');
            return;
        }
        setResult(response.data);
        toast.success(`Scanned ${response.data.batchesScanned} wallet batch(es)`);
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <ShieldCheck className="h-5 w-5 text-emerald-600" />
                        Wallet batch reconciliation
                    </CardTitle>
                    <CardDescription>
                        Check receipt batches against invoice allocations, covered periods, snapshots, and wallet debits.
                    </CardDescription>
                </div>
                <Button onClick={handleScan} disabled={isScanning} className="shrink-0">
                    {isScanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                    {isScanning ? 'Scanning…' : 'Run reconciliation'}
                </Button>
            </CardHeader>
            {result && (
                <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Batches scanned</p>
                            <p className="mt-1 text-xl font-semibold">{result.batchesScanned}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Clean batches</p>
                            <p className="mt-1 text-xl font-semibold text-emerald-600">{result.cleanBatchCount}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Findings</p>
                            <p className="mt-1 text-xl font-semibold text-amber-600">{result.findings.length}</p>
                        </div>
                    </div>

                    {result.findings.length === 0 ? (
                        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                            <CheckCircle2 className="h-4 w-4" />
                            No wallet batch reconciliation findings were detected.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {result.findings.slice(0, 50).map((finding, index) => (
                                <div key={`${finding.batchId}-${finding.code}-${index}`} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant="outline" className="font-mono text-[10px]">{finding.code}</Badge>
                                            <span className="font-mono text-xs text-muted-foreground">Batch {finding.batchId.slice(0, 8)}</span>
                                        </div>
                                        <p className="mt-1 text-muted-foreground">{finding.message}</p>
                                        {(finding.expected !== undefined || finding.actual !== undefined) && (
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                Expected: {String(finding.expected ?? 'none')} · Actual: {String(finding.actual ?? 'none')}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {result.findings.length > 50 && (
                                <p className="text-xs text-muted-foreground">Showing the first 50 findings.</p>
                            )}
                        </div>
                    )}
                </CardContent>
            )}
        </Card>
    );
}
