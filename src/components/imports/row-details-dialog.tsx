'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { BankStatementRow } from '@/types/database';

interface RowDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: BankStatementRow | null;
}

export function RowDetailsDialog({
  open,
  onOpenChange,
  row,
}: RowDetailsDialogProps) {
  if (!row) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'matched': return 'bg-green-100 text-green-800';
      case 'unmatched': return 'bg-red-100 text-red-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'skipped': return 'bg-gray-100 text-gray-800';
      case 'created': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return 'bg-green-600 text-white';
      case 'medium': return 'bg-yellow-500 text-black';
      case 'low': return 'bg-orange-500 text-white';
      case 'manual': return 'bg-blue-600 text-white';
      default: return 'bg-gray-400 text-white';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Transaction Details</DialogTitle>
          <DialogDescription>
            Row #{row.row_number} - Full transaction information
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[500px] pr-4">
          <div className="space-y-4">
            {/* Transaction Information */}
            <div>
              <h3 className="font-semibold mb-2 text-sm text-muted-foreground">Transaction Information</h3>
              <div className="grid gap-3">
                <div className="flex justify-between items-start">
                  <span className="text-sm font-medium">Date:</span>
                  <span className="text-sm">
                    {row.transaction_date
                      ? new Date(row.transaction_date).toLocaleDateString('en-NG', {
                          weekday: 'short',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })
                      : 'N/A'}
                  </span>
                </div>

                <div className="flex justify-between items-start">
                  <span className="text-sm font-medium">Amount:</span>
                  <span className="text-sm font-mono font-semibold">
                    ₦{(row.amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex justify-between items-start">
                  <span className="text-sm font-medium">Type:</span>
                  <Badge variant={row.transaction_type === 'credit' ? 'default' : 'destructive'}>
                    {row.transaction_type || 'Unknown'}
                  </Badge>
                </div>

                <div className="flex justify-between items-start">
                  <span className="text-sm font-medium">Status:</span>
                  <Badge className={getStatusColor(row.status)}>
                    {row.status}
                  </Badge>
                </div>

                <Separator />

                <div className="space-y-1">
                  <span className="text-sm font-medium">Description:</span>
                  <p className="text-sm bg-muted p-2 rounded border break-words">
                    {row.description || 'No description'}
                  </p>
                </div>

                {row.reference && (
                  <div className="space-y-1">
                    <span className="text-sm font-medium">Reference:</span>
                    <p className="text-sm bg-muted p-2 rounded border font-mono break-all">
                      {row.reference}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Matching Information */}
            {row.matched_resident_id && (
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold mb-2 text-sm text-muted-foreground">Matching Information</h3>
                  <div className="grid gap-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Resident:</span>
                      <span className="text-sm">
                        {(row as any).resident?.first_name} {(row as any).resident?.last_name}
                      </span>
                    </div>

                    {row.match_confidence && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Confidence:</span>
                        <Badge className={getConfidenceColor(row.match_confidence)}>
                          {row.match_confidence}
                        </Badge>
                      </div>
                    )}

                    {row.match_method && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Method:</span>
                        <Badge variant="outline">
                          {row.match_method}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Tag Information */}
            {row.tag_id && (
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold mb-2 text-sm text-muted-foreground">Tag Information</h3>
                  <div className="grid gap-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Tagged:</span>
                      <span className="text-sm">Yes</span>
                    </div>

                    {row.tagged_at && (
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium">Tagged at:</span>
                        <span className="text-sm">
                          {new Date(row.tagged_at).toLocaleString('en-NG')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Raw Data */}
            <Separator />
            <div>
              <h3 className="font-semibold mb-2 text-sm text-muted-foreground">Raw CSV Data</h3>
              <ScrollArea className="h-[150px] w-full rounded border bg-muted p-3">
                <pre className="text-xs break-all whitespace-pre-wrap">
                  {JSON.stringify(row.raw_data, null, 2)}
                </pre>
              </ScrollArea>
            </div>

            {/* Error Message */}
            {row.error_message && (
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold mb-2 text-sm text-destructive">Error</h3>
                  <p className="text-sm bg-destructive/10 text-destructive p-2 rounded border border-destructive/20">
                    {row.error_message}
                  </p>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
