'use client';

import { useEffect, useState } from 'react';
import { getInvoiceCorrections } from '@/actions/billing/get-invoice-corrections';
import { formatCurrency } from '@/lib/utils';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, FileText, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

interface InvoiceWithDetails {
  id: string;
  invoice_number: string;
  amount_due: number;
  amount_paid: number;
  status: string;
  correction_reason: string | null;
  correction_type: 'credit_note' | 'debit_note' | null;
  created_at: string;
  invoice_items?: Array<{
    id: string;
    description: string;
    amount: number;
  }>;
}

interface CorrectionHistoryData {
  creditNotes: InvoiceWithDetails[];
  debitNotes: InvoiceWithDetails[];
  netAdjustment: number;
  effectiveBalance: number;
}

interface InvoiceCorrectionTimelineProps {
  invoiceId: string;
  originalInvoiceNumber: string;
  originalAmount: number;
  originalCreatedAt: string;
}

export function InvoiceCorrectionTimeline({
  invoiceId,
  originalInvoiceNumber,
  originalAmount,
  originalCreatedAt,
}: InvoiceCorrectionTimelineProps) {
  const [data, setData] = useState<CorrectionHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchCorrections = async () => {
      setLoading(true);
      const result = await getInvoiceCorrections(invoiceId);
      if (result.data) {
        setData(result.data as unknown as CorrectionHistoryData);
      }
      setLoading(false);
    };

    fetchCorrections();
  }, [invoiceId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 bg-muted animate-pulse rounded-lg" />
        <div className="h-24 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (!data || (data.creditNotes.length === 0 && data.debitNotes.length === 0)) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No corrections have been made to this invoice.</p>
      </div>
    );
  }

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const allCorrections = [...data.creditNotes, ...data.debitNotes].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <div className="bg-muted p-4 rounded-lg">
        <h3 className="font-semibold mb-3">Correction Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground mb-1">Original Amount</p>
            <p className="font-semibold">₦{formatCurrency(originalAmount)}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Net Adjustment</p>
            <p
              className={`font-semibold ${
                data.netAdjustment > 0
                  ? 'text-green-600'
                  : data.netAdjustment < 0
                  ? 'text-red-600'
                  : ''
              }`}
            >
              {data.netAdjustment > 0 ? '+' : ''}₦{formatCurrency(data.netAdjustment)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Effective Balance</p>
            <p className="font-semibold">₦{formatCurrency(data.effectiveBalance)}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Corrections</p>
            <p className="font-semibold">
              {data.creditNotes.length + data.debitNotes.length} note(s)
            </p>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative space-y-4">
        {/* Timeline Line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

        {/* Original Invoice */}
        <div className="relative pl-10">
          <div className="absolute left-0 top-2 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <FileText className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h4 className="font-semibold">Original Invoice</h4>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(originalCreatedAt), 'MMM dd, yyyy HH:mm')}
                </p>
              </div>
              <Badge variant="outline">{originalInvoiceNumber}</Badge>
            </div>
            <p className="text-lg font-semibold">₦{formatCurrency(originalAmount)}</p>
          </div>
        </div>

        {/* Corrections */}
        {allCorrections.map((correction) => {
          const isCredit = correction.correction_type === 'credit_note';
          const isExpanded = expandedItems[correction.id];

          return (
            <div key={correction.id} className="relative pl-10">
              <div
                className={`absolute left-0 top-2 w-8 h-8 rounded-full flex items-center justify-center ${
                  isCredit ? 'bg-red-100' : 'bg-green-100'
                }`}
              >
                {isCredit ? (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                ) : (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                )}
              </div>

              <div className="bg-white border rounded-lg">
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold">
                        {isCredit ? 'Credit Note' : 'Debit Note'}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(correction.created_at), 'MMM dd, yyyy HH:mm')}
                      </p>
                    </div>
                    <div className="text-right">
                      <Link
                        href={`/billing/${correction.id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {correction.invoice_number}
                      </Link>
                      <Badge
                        variant={isCredit ? 'destructive' : 'default'}
                        className="ml-2"
                      >
                        {correction.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-baseline gap-2 mb-3">
                    <p
                      className={`text-2xl font-semibold ${
                        isCredit ? 'text-red-600' : 'text-green-600'
                      }`}
                    >
                      {isCredit ? '-' : '+'}₦{formatCurrency(Math.abs(correction.amount_due))}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Paid: ₦{formatCurrency(Math.abs(correction.amount_paid))}
                    </p>
                  </div>

                  {/* Line Items */}
                  {correction.invoice_items && correction.invoice_items.length > 0 && (
                    <div className="border-t pt-3 mt-3">
                      <h5 className="text-sm font-medium mb-2">Items</h5>
                      <ul className="space-y-1">
                        {correction.invoice_items.map((item) => (
                          <li
                            key={item.id}
                            className="text-sm flex justify-between text-muted-foreground"
                          >
                            <span>{item.description}</span>
                            <span>₦{formatCurrency(Math.abs(item.amount))}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Reason (Expandable) */}
                  {correction.correction_reason && (
                    <div className="border-t pt-3 mt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpand(correction.id)}
                        className="w-full justify-between p-0 h-auto hover:bg-transparent"
                      >
                        <span className="text-sm font-medium">Reason for Correction</span>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                      {isExpanded && (
                        <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                          {correction.correction_reason}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Final State */}
        <div className="relative pl-10">
          <div className="absolute left-0 top-2 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
            <FileText className="h-4 w-4 text-secondary-foreground" />
          </div>
          <div className="bg-secondary/10 border border-secondary rounded-lg p-4">
            <h4 className="font-semibold mb-2">Effective Balance</h4>
            <p className="text-2xl font-semibold">₦{formatCurrency(data.effectiveBalance)}</p>
            <p className="text-sm text-muted-foreground mt-1">
              After {data.creditNotes.length + data.debitNotes.length} correction(s)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
