'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { useInvoices, useResidentIndebtedness, useResidentWallet } from '@/hooks/use-billing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  CreditCard,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ChevronRight,
  Wallet,
  Calendar,
  Home,
  Download,
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { InvoiceWithDetails, InvoiceStatus } from '@/types/database';

// Status configuration
const statusConfig: Record<InvoiceStatus, { icon: React.ElementType; label: string; color: string }> = {
  unpaid: { icon: AlertCircle, label: 'Unpaid', color: 'text-amber-600 bg-amber-500/10' },
  partially_paid: { icon: Clock, label: 'Partial', color: 'text-blue-600 bg-blue-500/10' },
  paid: { icon: CheckCircle2, label: 'Paid', color: 'text-emerald-600 bg-emerald-500/10' },
  void: { icon: XCircle, label: 'Void', color: 'text-muted-foreground bg-muted' },
  overdue: { icon: AlertCircle, label: 'Overdue', color: 'text-red-600 bg-red-500/10' },
};

/**
 * Resident Portal Invoices Page
 *
 * Shows all invoices for the resident with:
 * - Summary stats (total due, paid)
 * - Filter tabs (All, Unpaid, Paid)
 * - Invoice list with status badges
 * - Invoice detail sheet
 */
export default function ResidentInvoicesPage() {
  const { residentId } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceWithDetails | null>(null);

  // Fetch data
  const { data: invoicesData, isLoading: invoicesLoading } = useInvoices({
    residentId: residentId || undefined,
    limit: 100,
  });
  const { data: indebtedness, isLoading: indebtednessLoading } = useResidentIndebtedness(residentId || undefined);
  const { data: wallet, isLoading: walletLoading } = useResidentWallet(residentId || undefined);

  const isLoading = invoicesLoading || indebtednessLoading || walletLoading;
  const invoices = invoicesData?.data || [];

  // Filter invoices based on tab
  const filteredInvoices = invoices.filter((invoice) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'unpaid') return ['unpaid', 'partially_paid', 'overdue'].includes(invoice.status);
    if (activeTab === 'paid') return invoice.status === 'paid';
    return true;
  });

  // Count by status
  const unpaidCount = invoices.filter(i => ['unpaid', 'partially_paid', 'overdue'].includes(i.status)).length;
  const paidCount = invoices.filter(i => i.status === 'paid').length;

  if (isLoading) {
    return <InvoicesSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
        <p className="text-muted-foreground">View your invoices and payment history</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-gradient-to-br from-red-500/10 to-orange-500/5 border-red-500/20">
          <CardContent className="p-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className="text-xl font-bold text-red-600 dark:text-red-400">
                {formatCurrency(indebtedness?.totalUnpaid || 0)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border-emerald-500/20">
          <CardContent className="p-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Wallet Balance</p>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(wallet?.balance || 0)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="all" className="text-xs sm:text-sm">
            All ({invoices.length})
          </TabsTrigger>
          <TabsTrigger value="unpaid" className="text-xs sm:text-sm">
            Unpaid ({unpaidCount})
          </TabsTrigger>
          <TabsTrigger value="paid" className="text-xs sm:text-sm">
            Paid ({paidCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4 space-y-3">
          {filteredInvoices.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground">No invoices found</p>
              </CardContent>
            </Card>
          ) : (
            filteredInvoices.map((invoice) => (
              <InvoiceCard
                key={invoice.id}
                invoice={invoice}
                onClick={() => setSelectedInvoice(invoice)}
              />
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Invoice Detail Sheet */}
      <InvoiceDetailSheet
        invoice={selectedInvoice}
        open={!!selectedInvoice}
        onOpenChange={(open) => !open && setSelectedInvoice(null)}
      />
    </div>
  );
}

// Invoice Card Component
function InvoiceCard({
  invoice,
  onClick,
}: {
  invoice: InvoiceWithDetails;
  onClick: () => void;
}) {
  const config = statusConfig[invoice.status];
  const StatusIcon = config.icon;
  const remaining = (invoice.amount_due || 0) - (invoice.amount_paid || 0);

  return (
    <Card
      className="cursor-pointer hover:border-primary/30 transition-colors active:scale-[0.99]"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Status Icon */}
            <div className={cn('p-2 rounded-lg shrink-0', config.color)}>
              <StatusIcon className="h-4 w-4" />
            </div>

            {/* Invoice Info */}
            <div className="min-w-0">
              <p className="font-medium truncate">{invoice.invoice_number}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{invoice.billing_profile?.name || 'Invoice'}</span>
                {invoice.due_date && (
                  <>
                    <span className="text-muted-foreground/30">•</span>
                    <span>Due {format(new Date(invoice.due_date), 'MMM d, yyyy')}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Amount & Arrow */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <p className={cn(
                'font-semibold',
                remaining > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
              )}>
                {formatCurrency(remaining > 0 ? remaining : invoice.amount_due || 0)}
              </p>
              <Badge variant="secondary" className="text-[10px]">
                {config.label}
              </Badge>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Invoice Detail Sheet
function InvoiceDetailSheet({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: InvoiceWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!invoice) return null;

  const config = statusConfig[invoice.status];
  const StatusIcon = config.icon;
  const remaining = (invoice.amount_due || 0) - (invoice.amount_paid || 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
        <SheetHeader className="text-left pb-4">
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {invoice.invoice_number}
          </SheetTitle>
          <SheetDescription>
            {invoice.billing_profile?.name || 'Invoice Details'}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 overflow-y-auto pb-8">
          {/* Status Badge */}
          <div className={cn(
            'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
            config.color
          )}>
            <StatusIcon className="h-4 w-4" />
            {config.label}
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Total Due</p>
                <p className="text-xl font-bold">{formatCurrency(invoice.amount_due || 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Amount Paid</p>
                <p className="text-xl font-bold text-emerald-600">{formatCurrency(invoice.amount_paid || 0)}</p>
              </CardContent>
            </Card>
          </div>

          {remaining > 0 && (
            <Card className="bg-red-500/5 border-red-500/20">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Remaining Balance</p>
                <p className="text-xl font-bold text-red-600">{formatCurrency(remaining)}</p>
              </CardContent>
            </Card>
          )}

          {/* Details */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Details</h3>

            {invoice.house && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Home className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Property</p>
                  <p className="text-xs text-muted-foreground">
                    {invoice.house.house_number}, {invoice.house.street?.name}
                  </p>
                </div>
              </div>
            )}

            {invoice.due_date && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Due Date</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(invoice.due_date), 'MMMM d, yyyy')}
                  </p>
                </div>
              </div>
            )}

            {invoice.created_at && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Invoice Date</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(invoice.created_at), 'MMMM d, yyyy')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Invoice Items */}
          {invoice.invoice_items && invoice.invoice_items.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Line Items</h3>
              <Card>
                <CardContent className="p-0 divide-y">
                  {invoice.invoice_items.map((item) => (
                    <div key={item.id} className="p-3 flex justify-between items-center">
                      <p className="text-sm">{item.description}</p>
                      <p className="font-medium">{formatCurrency(item.amount || 0)}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Download Button - Future Feature */}
          <Button variant="outline" className="w-full gap-2" disabled>
            <Download className="h-4 w-4" />
            Download Receipt (Coming Soon)
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Skeleton
function InvoicesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>

      <Skeleton className="h-10 w-full" />

      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
