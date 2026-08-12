'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useGenerateInvoicesPreview, useGenerateInvoices } from '@/hooks/use-billing';
import { formatCurrency } from '@/lib/utils';
import { Calendar, FileBarChart, AlertCircle, CheckCircle2, Eye, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';

interface GenerateInvoicesDialogProps {
  open: boolean;
  onClose: () => void;
}

export function GenerateInvoicesDialog({ open, onClose }: GenerateInvoicesDialogProps) {
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const previewMutation = useGenerateInvoicesPreview();
  const generateMutation = useGenerateInvoices();
  const [preview, setPreview] = useState(previewMutation.data ?? null);
  const [confirmed, setConfirmed] = useState(false);
  const [debitWallet, setDebitWallet] = useState(true);
  const [sendEmails, setSendEmails] = useState(true);

  if (!open) return null;

  const handlePreview = async () => {
    try {
      const result = await previewMutation.mutateAsync({ targetDate: new Date(targetDate + '-01') });
      setPreview(result);
      setConfirmed(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Preview failed');
    }
  };

  const handleGenerate = async () => {
    try {
      const { generateMonthlyInvoices } = await import('@/actions/billing/generate-invoices');
      await generateMonthlyInvoices(new Date(targetDate + '-01'), 'manual', { debitWallet, sendEmails });
      toast.success('Invoices generated successfully');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generation failed');
    }
  };

  const summary = preview?.summary;
  const previewItems = preview?.preview || [];
  const skipList = preview?.skipList || [];
  const newItems = previewItems.filter((p) => p.isNew);
  const existingItems = previewItems.filter((p) => !p.isNew);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto pt-[10vh]" onClick={onClose}>
      <div className="w-full max-w-2xl p-4" onClick={(e) => e.stopPropagation()}>
        <Card className="shadow-xl">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileBarChart className="h-5 w-5" />
                Generate Invoices
              </CardTitle>
              <div className="flex items-center gap-2">
                <input
                  type="month"
                  value={targetDate}
                  onChange={(e) => { setTargetDate(e.target.value); setPreview(null); setConfirmed(false); }}
                  className="rounded-md border px-2 py-1 text-sm"
                />
                <Button size="sm" onClick={handlePreview} disabled={previewMutation.isPending}>
                  {previewMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Eye className="mr-1 h-4 w-4" />}
                  Preview
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 p-4 max-h-[60vh] overflow-y-auto">
            {previewMutation.isPending && (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full rounded" />)}
              </div>
            )}

            {summary && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border bg-muted/50 p-3 text-center">
                    <p className="text-xs text-muted-foreground">New Invoices</p>
                    <p className="text-lg font-bold">{summary.newInvoices}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/50 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total Amount</p>
                    <p className="text-lg font-bold">{formatCurrency(summary.totalAmount)}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/50 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Wallet Impact</p>
                    <p className="text-lg font-bold">{formatCurrency(summary.totalWalletDeductions)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{summary.eligibleHouses} houses</Badge>
                  <Badge variant="secondary">{summary.totalResidents} residents</Badge>
                  {existingItems.length > 0 && <Badge variant="outline">{existingItems.length} existing skipped</Badge>}
                </div>

                {summary.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
                    {summary.warnings.map((w, i) => (
                      <p key={i} className="flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-200">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />{w}
                      </p>
                    ))}
                  </div>
                )}

                {newItems.length > 0 && (
                  <>
                    <Separator />
                    <p className="text-xs font-semibold text-muted-foreground uppercase">New Invoices ({newItems.length})</p>
                    <div className="max-h-40 space-y-1 overflow-y-auto">
                      {newItems.map((item, i) => (
                        <div key={i} className="flex items-center justify-between rounded border px-2.5 py-1.5 text-xs">
                          <div className="min-w-0">
                            <span className="font-medium">{item.houseNumber}</span>
                            <span className="mx-1 text-muted-foreground">&bull;</span>
                            <span className="truncate">{item.residentName}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-muted-foreground">{item.periodStart}</span>
                            <span className="font-medium tabular-nums">{formatCurrency(item.amount)}</span>
                            {item.isProRata && <Badge variant="outline" className="text-[10px]">Pro-rata</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {skipList.length > 0 && (
                  <>
                    <Separator />
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Skipped ({skipList.length})</p>
                    <div className="max-h-24 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                      {skipList.map((s, i) => <p key={i}>{s.house}: {s.reason}</p>)}
                    </div>
                  </>
                )}
              </>
            )}

            {previewMutation.data && !previewMutation.isPending && (
              <Separator />
            )}

            <div className="flex items-center gap-2 pt-2">
              {!confirmed ? (
                <Button className="w-full" onClick={() => setConfirmed(true)} disabled={!preview}>
                  <Play className="mr-1.5 h-4 w-4" />
                  Start Generation
                </Button>
              ) : (
                <div className="flex w-full gap-2">
                  <Button variant="outline" onClick={() => setConfirmed(false)}>Back</Button>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={debitWallet} onChange={(e) => setDebitWallet(e.target.checked)} className="rounded" /> Auto-debit wallets</label>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sendEmails} onChange={(e) => setSendEmails(e.target.checked)} className="rounded" /> Send emails</label>
                    </div>
                    <Button className="w-full" onClick={handleGenerate} disabled={generateMutation.isPending}>
                      {generateMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                      Confirm &amp; Generate
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
