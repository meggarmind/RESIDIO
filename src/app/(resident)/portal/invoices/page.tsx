'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/auth-provider';
import { useInvoices, useResidentIndebtedness, useResidentWallet } from '@/hooks/use-billing';
import { useIsDesktop } from '@/hooks/use-media-query';
import { FeatureRestrictionGate } from '@/components/resident-portal/feature-restriction-gate';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ResponsiveSheet,
  ResponsiveSheetHeader,
  ResponsiveSheetTitle,
  ResponsiveSheetDescription,
  ResponsiveSheetBody,
} from '@/components/ui/responsive-sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
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
  Loader2,
  ScrollText,
} from 'lucide-react';
import { StatementGeneratorDialog } from '@/components/billing/statement-generator-dialog';
import { formatCurrency, cn, getPropertyShortname } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useLayoutTheme } from '@/contexts/layout-theme-context';
import { payInvoiceWithWallet } from '@/actions/billing/pay-invoice-with-wallet';
import { disputeInvoice } from '@/actions/billing/dispute-invoice';
import { PaystackPayButton } from '@/components/payments/paystack-pay-button';
import { BulkPaymentSheet } from '@/components/payments/bulk-payment-sheet';
import type { InvoiceWithDetails, InvoiceStatus } from '@/types/database';

// Spring physics for smooth, professional animations
const spring = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
  mass: 1,
};

// Card animation variants for summary cards
const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (custom: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      ...spring,
      delay: custom * 0.1, // 100ms stagger between cards
    },
  }),
};

// Row animation variants for invoice rows
const rowVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (custom: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      ...spring,
      delay: custom * 0.05, // 50ms stagger between rows
    },
  }),
};

// Status configuration with theme-aware colors
const statusConfig: Record<InvoiceStatus, { icon: React.ElementType; label: string; textColor: string; bgColor: string }> = {
  unpaid: { icon: AlertCircle, label: 'Unpaid', textColor: 'var(--status-warning)', bgColor: 'var(--status-warning-subtle)' },
  partially_paid: { icon: Clock, label: 'Partial', textColor: 'var(--status-info)', bgColor: 'var(--status-info-subtle)' },
  paid: { icon: CheckCircle2, label: 'Paid', textColor: 'var(--status-success)', bgColor: 'var(--status-success-subtle)' },
  void: { icon: XCircle, label: 'Void', textColor: 'var(--text-disabled)', bgColor: 'var(--bg-secondary)' },
  overdue: { icon: AlertCircle, label: 'Overdue', textColor: 'var(--status-error)', bgColor: 'var(--status-error-subtle)' },
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
  const queryClient = useQueryClient();
  const isDesktop = useIsDesktop();
  const { isExpanded } = useLayoutTheme();
  const [activeTab, setActiveTab] = useState<string>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceWithDetails | null>(null);

  // NEW: Multi-selection state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [isBulkSheetOpen, setIsBulkSheetOpen] = useState(false);

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

  // Extract unique houses from invoices for statement generator
  const uniqueHouses = invoices.reduce((acc, invoice) => {
    if (invoice.house && !acc.find(h => h.id === invoice.house?.id)) {
      acc.push({
        id: invoice.house.id,
        house_number: invoice.house.house_number,
        short_name: invoice.house.short_name,
        street: invoice.house.street,
      });
    }
    return acc;
  }, [] as Array<{ id: string; house_number: string; short_name?: string | null; street?: { name: string } | null }>);

  if (isLoading) {
    return <InvoicesSkeleton />;
  }

  return (
    <FeatureRestrictionGate
      featureName="payment history"
      loadingFallback={<InvoicesSkeleton />}
    >
      <div className={cn('space-y-6', isExpanded && 'space-y-8')}>
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className={cn(
              'text-2xl font-bold tracking-tight',
              isExpanded && 'text-3xl xl:text-4xl'
            )}>Payments</h1>
            <p className={cn(
              'text-muted-foreground',
              isExpanded && 'text-base'
            )}>View your invoices and payment history</p>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'unpaid' && invoices.some(i => ['unpaid', 'partially_paid', 'overdue'].includes(i.status)) && (
              <Button
                variant={isSelectionMode ? "secondary" : "outline"}
                size="sm"
                onClick={() => {
                  setIsSelectionMode(!isSelectionMode);
                  setSelectedInvoiceIds(new Set());
                }}
                className="gap-2"
              >
                {isSelectionMode ? 'Cancel' : 'Select'}
              </Button>
            )}
            {residentId && (
              <StatementGeneratorDialog
                residentId={residentId}
                houses={uniqueHouses}
                trigger={
                  <Button variant="outline" size="sm" className="gap-2 shrink-0">
                    <ScrollText className="h-4 w-4" />
                    <span className="hidden sm:inline">Account Statement</span>
                    <span className="sm:hidden">Statement</span>
                  </Button>
                }
              />
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className={cn(
          'grid grid-cols-2 gap-3',
          isExpanded && 'lg:grid-cols-4 gap-4'
        )}>
          <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            custom={0}
          >
            <Card
              className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]"
              onClick={() => setActiveTab('unpaid')}
              style={{
                background: activeTab === 'unpaid'
                  ? `linear-gradient(to bottom right, var(--status-error-subtle), var(--bg-card))`
                  : `linear-gradient(to bottom right, var(--status-error-subtle), transparent)`,
                borderColor: activeTab === 'unpaid' ? 'var(--status-error)' : 'var(--border-default)',
                borderWidth: activeTab === 'unpaid' ? '2px' : '1px',
              }}
            >
              <CardContent className="p-4 text-center sm:text-left">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wider font-bold" style={{ color: 'var(--text-muted)' }}>Outstanding</p>
                  <p className="text-xl sm:text-2xl font-black" style={{ color: 'var(--status-error)' }}>
                    <AnimatedCounter
                      value={indebtedness?.totalUnpaid || 0}
                      formatter={formatCurrency}
                    />
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            custom={1}
          >
            <Card
              className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]"
              onClick={() => router.push('/portal/wallet')}
              style={{
                background: `linear-gradient(to bottom right, var(--status-success-subtle), transparent)`,
                borderColor: 'var(--status-success)',
              }}
            >
              <CardContent className="p-4 text-center sm:text-left">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wider font-bold" style={{ color: 'var(--text-muted)' }}>Wallet Balance</p>
                  <p className="text-xl sm:text-2xl font-black" style={{ color: 'var(--status-success)' }}>
                    <AnimatedCounter
                      value={wallet?.balance || 0}
                      formatter={formatCurrency}
                    />
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
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

          <AnimatePresence mode="wait">
            <TabsContent value={activeTab} className="mt-4" asChild>
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {filteredInvoices.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="py-8 text-center">
                      <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                      <p className="text-muted-foreground">No invoices found</p>
                    </CardContent>
                  </Card>
                ) : isDesktop ? (
                  <div className="space-y-3">
                    {filteredInvoices.map((invoice, index) => (
                      <InvoiceCard
                        key={invoice.id}
                        invoice={invoice}
                        onClick={() => {
                          if (isSelectionMode) {
                            const next = new Set(selectedInvoiceIds);
                            if (next.has(invoice.id)) next.delete(invoice.id);
                            else next.add(invoice.id);
                            setSelectedInvoiceIds(next);
                          } else {
                            setSelectedInvoice(invoice);
                          }
                        }}
                        index={index}
                        isSelected={selectedInvoiceIds.has(invoice.id)}
                        isSelectionMode={isSelectionMode}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            </TabsContent>
          </AnimatePresence>
        </Tabs>

        {/* Floating Bulk Action Bar */}
        <AnimatePresence>
          {isSelectionMode && selectedInvoiceIds.size > 0 && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md px-4 py-3 bg-slate-900 text-white rounded-2xl shadow-2xl flex items-center justify-between gap-4"
            >
              <div>
                <p className="text-sm font-bold">{selectedInvoiceIds.size} Selected</p>
                <p className="text-xs text-slate-400">
                  Total: {formatCurrency(
                    invoices
                      .filter(i => selectedInvoiceIds.has(i.id))
                      .reduce((sum, i) => sum + ((i.amount_due || 0) - (i.amount_paid || 0)), 0)
                  )}
                </p>
              </div>
              <Button
                onClick={() => setIsBulkSheetOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white border-none font-bold px-6"
              >
                Pay Total
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <InvoiceDetailSheet
          invoice={selectedInvoice}
          open={!!selectedInvoice}
          onOpenChange={(open) => !open && setSelectedInvoice(null)}
          walletBalance={wallet?.balance || 0}
          onPaymentSuccess={() => {
            // Invalidate all related queries to refresh data
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            queryClient.invalidateQueries({ queryKey: ['resident-wallet', residentId] });
            queryClient.invalidateQueries({ queryKey: ['wallet-transactions', residentId] });
            queryClient.invalidateQueries({ queryKey: ['resident-indebtedness', residentId] });
          }}
        />

        {/* Bulk Payment Sheet */}
        <BulkPaymentSheet
          invoices={invoices.filter(i => selectedInvoiceIds.has(i.id))}
          open={isBulkSheetOpen}
          onOpenChange={setIsBulkSheetOpen}
          walletBalance={wallet?.balance || 0}
          onSuccess={() => {
            setIsSelectionMode(false);
            setSelectedInvoiceIds(new Set());
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            queryClient.invalidateQueries({ queryKey: ['resident-wallet', residentId] });
          }}
        />
      </div>
    </FeatureRestrictionGate>
  );
}

// Invoice Card Component (Mobile)
function InvoiceCard({
  invoice,
  onClick,
  index,
  isSelected,
  isSelectionMode,
}: {
  invoice: InvoiceWithDetails;
  onClick: () => void;
  index: number;
  isSelected?: boolean;
  isSelectionMode?: boolean;
}) {
  const config = statusConfig[invoice.status];
  const StatusIcon = config.icon;
  const remaining = (invoice.amount_due || 0) - (invoice.amount_paid || 0);

  // Map status to StatusBadge variant
  const getStatusVariant = (status: InvoiceStatus): 'success' | 'error' | 'warning' | 'info' => {
    if (status === 'paid') return 'success';
    if (status === 'overdue') return 'error';
    if (status === 'unpaid' || status === 'partially_paid') return 'warning';
    return 'info';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <motion.div
      variants={rowVariants}
      initial="hidden"
      animate="visible"
      custom={index}
    >
      <Card
        className={cn(
          "cursor-pointer transition-all active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 overflow-hidden",
          isSelected && "ring-2 ring-emerald-500 ring-offset-2"
        )}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`Invoice ${invoice.invoice_number}, ${config.label}`}
        style={{
          backgroundColor: isSelected ? 'var(--status-success-subtle)' : 'var(--bg-card)',
          borderColor: isSelected ? 'var(--status-success)' : 'var(--border-default)',
        }}
      >
        <CardContent className="p-4 relative">
          {isSelectionMode && (
            <div className="absolute right-4 top-4">
              <div className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                isSelected ? "bg-emerald-500 border-emerald-500 text-white" : "border-muted-foreground/30"
              )}>
                {isSelected && <CheckCircle2 className="h-3 w-3" />}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
          e.currentTarget.style.borderColor = 'var(--border-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--bg-card)';
          e.currentTarget.style.borderColor = 'var(--border-default)';
        }}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {/* Status Icon */}
              <div
                className="p-2 rounded-lg shrink-0"
                style={{
                  color: config.textColor,
                  backgroundColor: config.bgColor,
                }}
              >
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
                <p
                  className="font-semibold"
                  style={{
                    color: remaining > 0 ? 'var(--status-error)' : 'var(--text-secondary)'
                  }}
                >
                  {formatCurrency(remaining > 0 ? remaining : invoice.amount_due || 0)}
                </p>
                <StatusBadge variant={getStatusVariant(invoice.status)}>
                  {config.label}
                </StatusBadge>
              </div>
              <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Invoice Table Component (Desktop)
function InvoiceTable({
  invoices,
  onSelect,
  isSelectionMode,
  selectedInvoiceIds,
  onToggleSelection,
}: {
  invoices: InvoiceWithDetails[];
  onSelect: (invoice: InvoiceWithDetails) => void;
  isSelectionMode?: boolean;
  selectedInvoiceIds?: Set<string>;
  onToggleSelection?: (id: string) => void;
}) {
  // Map status to StatusBadge variant
  const getStatusVariant = (status: InvoiceStatus): 'success' | 'error' | 'warning' | 'info' => {
    if (status === 'paid') return 'success';
    if (status === 'overdue') return 'error';
    if (status === 'unpaid' || status === 'partially_paid') return 'warning';
    return 'info';
  };

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            {isSelectionMode && <TableHead className="w-[40px]"></TableHead>}
            <TableHead>Invoice #</TableHead>
            <TableHead>Property</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Paid</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice, index) => {
            const config = statusConfig[invoice.status];
            const remaining = (invoice.amount_due || 0) - (invoice.amount_paid || 0);

            return (
              <motion.tr
                key={invoice.id}
                className={cn(
                   "cursor-pointer hover:bg-muted/50 transition-colors",
                   selectedInvoiceIds?.has(invoice.id) && "bg-emerald-500/5 hover:bg-emerald-500/10"
                )}
                onClick={() => {
                  if (isSelectionMode && onToggleSelection) {
                    onToggleSelection(invoice.id);
                  } else {
                    onSelect(invoice);
                  }
                }}
                variants={rowVariants}
                initial="hidden"
                animate="visible"
                custom={index}
              >
                {isSelectionMode && (
                  <TableCell>
                    <div className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                      selectedInvoiceIds?.has(invoice.id) ? "bg-emerald-500 border-emerald-500 text-white" : "border-muted-foreground/30"
                    )}>
                      {selectedInvoiceIds?.has(invoice.id) && <CheckCircle2 className="h-3 w-3" />}
                    </div>
                  </TableCell>
                )}
                <TableCell className="font-medium">
                  {invoice.invoice_number}
                </TableCell>
                <TableCell>
                  {invoice.house ? (
                    <span className="text-sm">
                      <span className="font-mono font-semibold bg-muted px-1.5 py-0.5 rounded text-xs">
                        {getPropertyShortname(invoice.house)}
                      </span>
                      {invoice.house.street?.name && (
                        <span className="text-muted-foreground ml-1.5">
                          {invoice.house.street.name}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {invoice.billing_profile?.name || '-'}
                  </span>
                </TableCell>
                <TableCell>
                  {invoice.due_date ? (
                    format(new Date(invoice.due_date), 'MMM d, yyyy')
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(invoice.amount_due || 0)}
                </TableCell>
                <TableCell className="text-right" style={{ color: 'var(--status-success)' }}>
                  {formatCurrency(invoice.amount_paid || 0)}
                </TableCell>
                <TableCell>
                  <StatusBadge variant={getStatusVariant(invoice.status)}>
                    {config.label}
                  </StatusBadge>
                </TableCell>
                <TableCell>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </TableCell>
              </motion.tr>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

// Invoice Detail Sheet (Responsive: bottom sheet on mobile, right drawer on desktop)
function InvoiceDetailSheet({
  invoice,
  open,
  onOpenChange,
  walletBalance,
  onPaymentSuccess,
}: {
  invoice: InvoiceWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletBalance: number;
  onPaymentSuccess: () => void;
}) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPayingWithWallet, setIsPayingWithWallet] = useState(false);
  const [enteredAmount, setEnteredAmount] = useState<string>('');
  const [isDisputing, setIsDisputing] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');

  if (!invoice) return null;

  const config = statusConfig[invoice.status];
  const StatusIcon = config.icon;
  const remaining = (invoice.amount_due || 0) - (invoice.amount_paid || 0);
  const isPaid = invoice.status === 'paid';

  // Max amount user can pay (limited by wallet and debt)
  const maxPayable = Math.max(0, Math.min(walletBalance, remaining));

  // Download receipt handler
  const handleDownloadReceipt = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch(`/api/receipts/${invoice.id}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to download receipt');
      }

      // Get the blob from the response
      const blob = await response.blob();

      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Get filename from Content-Disposition header or generate one
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `RCP-${invoice.invoice_number?.replace('INV-', '') || invoice.id.slice(0, 8)}.pdf`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }

      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Receipt downloaded successfully');
    } catch (error) {
      console.error('Download error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to download receipt');
    } finally {
      setIsDownloading(false);
    }
  };

  // Pay with wallet handler
  const handlePayWithWallet = async () => {
    const amountToPay = parseFloat(enteredAmount);

    if (isNaN(amountToPay) || amountToPay <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (amountToPay > maxPayable) {
      toast.error(`Amount cannot exceed wallet balance (${formatCurrency(walletBalance)}) or remaining due (${formatCurrency(remaining)})`);
      return;
    }

    setIsPayingWithWallet(true);
    try {
      const result = await payInvoiceWithWallet(invoice.id, amountToPay);

      if (result.success) {
        const message = result.invoiceFullyPaid
          ? `Invoice paid in full! ₦${result.amountPaid.toLocaleString()} debited from wallet.`
          : `Partial payment of ₦${result.amountPaid.toLocaleString()} applied. Remaining: ₦${(remaining - result.amountPaid).toLocaleString()}`;
        toast.success(message);
        onPaymentSuccess();
        onOpenChange(false);
      } else {
        toast.error(result.error || 'Payment failed');
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Failed to process payment');
    } finally {
      setIsPayingWithWallet(false);
    }
  };

  // Dispute Handler
  const handleDispute = async () => {
    if (!disputeReason.trim()) {
      toast.error('Please provide a reason for the dispute');
      return;
    }
    setIsDisputing(true);
    try {
      const result = await disputeInvoice(invoice.id, disputeReason);
      if (result.success) {
        toast.success('Dispute submitted successfully. We will review it shortly.');
        setDisputeOpen(false);
        setDisputeReason('');
      } else {
        toast.error(result.error || 'Failed to submit dispute');
      }
    } catch (error) {
      console.error('Dispute error:', error);
      toast.error('Something went wrong');
    } finally {
      setIsDisputing(false);
    }
  };

  // Set default amount when opening
  // We use a key trick or effect. Effect is better here.
  // Although we can't use useEffect trivially with conditional return above... 
  // actually we returned null early, so hooks order is violated if we add useEffect after.
  // FIX: Move hooks to top. But waiting for re-render is fine.
  // Instead of useEffect, let's just use a "init" state or similar, 
  // OR just assume if empty, we set it.
  // Actually, better to just default it in a useEffect that watches `invoice?.id`.
  // BUT hooks must be at top. I'll fix the early return.

  return (
    <InvoiceDetailSheetContent
      invoice={invoice}
      open={open}
      onOpenChange={onOpenChange}
      walletBalance={walletBalance}
      onPaymentSuccess={onPaymentSuccess}
      isPaid={isPaid}
      maxPayable={maxPayable}
      remaining={remaining}
      config={config}
      StatusIcon={StatusIcon}
      handleDownloadReceipt={handleDownloadReceipt}
      handlePayWithWallet={handlePayWithWallet}
      isDownloading={isDownloading}
      isPayingWithWallet={isPayingWithWallet}
      enteredAmount={enteredAmount}
      setEnteredAmount={setEnteredAmount}
      isDisputing={isDisputing}
      disputeOpen={disputeOpen}
      setDisputeOpen={setDisputeOpen}
      disputeReason={disputeReason}
      setDisputeReason={setDisputeReason}
      handleDispute={handleDispute}
    />
  );
}

function InvoiceDetailSheetContent({
  invoice, open, onOpenChange, walletBalance, onPaymentSuccess, isPaid, maxPayable, remaining, config, StatusIcon, handleDownloadReceipt, handlePayWithWallet, isDownloading, isPayingWithWallet, enteredAmount, setEnteredAmount,
  isDisputing, disputeOpen, setDisputeOpen, disputeReason, setDisputeReason, handleDispute
}: any) {

  useEffect(() => {
    if (open && invoice) {
      const rem = (invoice.amount_due || 0) - (invoice.amount_paid || 0);
      const max = Math.max(0, Math.min(walletBalance, rem));
      setEnteredAmount(max > 0 ? max.toString() : '');
    }
  }, [open, invoice, walletBalance]);

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      variant="drawer"
      drawerWidth="lg"
    >
      <ResponsiveSheetHeader>
        <ResponsiveSheetTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {invoice.invoice_number}
        </ResponsiveSheetTitle>
        <ResponsiveSheetDescription>
          {invoice.billing_profile?.name || 'Invoice Details'}
        </ResponsiveSheetDescription>
      </ResponsiveSheetHeader>

      <ResponsiveSheetBody>
        <div className="space-y-6 pb-8">
          {/* Status Badge */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
            style={{
              color: config.textColor,
              backgroundColor: config.bgColor,
            }}
          >
            <StatusIcon className="h-4 w-4" />
            {config.label}
          </div>

          {/* Amounts - Two columns on desktop */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Total Due</p>
                <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(invoice.amount_due || 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Amount Paid</p>
                <p className="text-xl font-bold" style={{ color: 'var(--status-success)' }}>{formatCurrency(invoice.amount_paid || 0)}</p>
              </CardContent>
            </Card>
          </div>

          {remaining > 0 && (
            <Card
              style={{
                backgroundColor: 'var(--status-error-subtle)',
                borderColor: 'var(--status-error)',
              }}
            >
              <CardContent className="p-4">
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Remaining Balance</p>
                <p className="text-xl font-bold" style={{ color: 'var(--status-error)' }}>{formatCurrency(remaining)}</p>
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
                  <p className="text-sm font-medium">
                    <span className="font-mono font-semibold bg-background px-1.5 py-0.5 rounded text-xs mr-1">
                      {getPropertyShortname(invoice.house)}
                    </span>
                    Property
                  </p>
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
                  {invoice.invoice_items.map((item: any) => (
                    <div key={item.id} className="p-3 flex justify-between items-center">
                      <p className="text-sm">{item.description}</p>
                      <p className="font-medium">{formatCurrency(item.amount || 0)}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Pay with Wallet Button */}
          {maxPayable > 0 && walletBalance > 0 ? (
            <Card
              style={{
                backgroundColor: 'var(--status-success-subtle)',
                borderColor: 'var(--status-success)',
              }}
            >
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4" style={{ color: 'var(--status-success)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Pay with Wallet</span>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Balance: {formatCurrency(walletBalance)}
                  </span>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Payment Amount (₦)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="1"
                      max={maxPayable}
                      value={enteredAmount}
                      onChange={(e) => setEnteredAmount(e.target.value)}
                      className="h-9"
                      placeholder={maxPayable.toString()}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={() => setEnteredAmount(maxPayable.toString())}
                    >
                      Max
                    </Button>
                  </div>
                </div>

                <Button
                  className="w-full gap-2"
                  onClick={handlePayWithWallet}
                  disabled={isPayingWithWallet || !enteredAmount || parseFloat(enteredAmount) <= 0}
                >
                  {isPayingWithWallet ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Wallet className="h-4 w-4" />
                      Pay Now
                    </>
                  )}
                </Button>

                {enteredAmount && parseFloat(enteredAmount) < remaining && (
                  <p className="text-xs text-muted-foreground text-center">
                    Remaining after payment: {formatCurrency(remaining - (parseFloat(enteredAmount) || 0))}
                  </p>
                )}
              </CardContent>
            </Card>
          ) : null}

          {/* Pay Online with Paystack */}
          {!isPaid && remaining > 0 && (
            <Card
              style={{
                background: `linear-gradient(to bottom right, var(--status-success-subtle), transparent)`,
                borderColor: 'var(--status-success)',
              }}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" style={{ color: 'var(--status-success)' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Pay Online</span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Pay securely with card, bank transfer, or USSD
                </p>
                <PaystackPayButton
                  invoiceId={invoice.id}
                  amount={remaining}
                  invoiceNumber={invoice.invoice_number}
                />
              </CardContent>
            </Card>
          )}

          {/* Download Receipt Button */}
          <Button
            variant={isPaid ? 'default' : 'outline'}
            className="w-full gap-2"
            onClick={handleDownloadReceipt}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating PDF...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                {isPaid ? 'Download Receipt' : 'Download Invoice'}
              </>
            )}
          </Button>

          {/* Dispute Button */}
          {!isPaid && (
            <div className="pt-2">
              <Button
                variant="ghost"
                className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                onClick={() => setDisputeOpen(true)}
              >
                Dispute Invoice
              </Button>
            </div>
          )}

          <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Dispute Invoice</DialogTitle>
                <DialogDescription>
                  Describe the issue with this invoice. The management will review your dispute.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Textarea
                  placeholder="Reason for dispute..."
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDisputeOpen(false)}>Cancel</Button>
                <Button
                  variant="destructive"
                  onClick={handleDispute}
                  disabled={isDisputing || !disputeReason.trim()}
                >
                  {isDisputing ? 'Submitting...' : 'Submit Dispute'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </ResponsiveSheetBody>
    </ResponsiveSheet>
  );
}

// Skeleton
function InvoicesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <ShimmerSkeleton className="h-8 w-32" />
        <ShimmerSkeleton className="h-4 w-48" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ShimmerSkeleton className="h-20 w-full rounded-xl" />
        <ShimmerSkeleton className="h-20 w-full rounded-xl" />
      </div>

      <ShimmerSkeleton className="h-10 w-full" />

      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <ShimmerSkeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
