'use client';

import { useState } from 'react';
import { format, startOfYear } from 'date-fns';
import { FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PayerStatementDialogProps {
  payerId: string;
  payerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Prints the statement of one collection payer, resident or not (#1196): every collection they paid into. */
export function PayerStatementDialog({ payerId, payerName, open, onOpenChange }: PayerStatementDialogProps) {
  const [fromDate, setFromDate] = useState(() => format(startOfYear(new Date()), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams({ payerId, fromDate, toDate });
      const response = await fetch(`/api/collections/statement?${params.toString()}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Could not make the statement');
      }
      const url = window.URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = response.headers.get('Content-Disposition')?.match(/filename="?([^"]+)"?/)?.[1] ?? 'collections-statement.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not make the statement');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Statement for {payerName}</DialogTitle>
          <DialogDescription>Every payment this payer made into any collection in the period.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="payer-statement-from">From</Label>
            <Input id="payer-statement-from" type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="payer-statement-to">To</Label>
            <Input id="payer-statement-to" type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={download} disabled={busy || !fromDate || !toDate || fromDate > toDate}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
