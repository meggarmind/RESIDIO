'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Check,
  Eye,
  Search,
  Settings,
  User,
  X,
} from 'lucide-react';
import { EnhancedTableCard } from '@/components/dashboard/enhanced-stat-card';
import { toast } from 'sonner';
import { getEmailImport } from '@/actions/email-imports/create-email-import';
import {
  getReviewQueue,
  processSingleTransaction,
  skipTransaction,
} from '@/actions/email-imports/process-email-import';
import { extractSenderName } from '@/lib/email-imports/utils';
import { getActiveResidents } from '@/actions/residents/get-residents';
import type { EmailImport, EmailTransaction } from '@/types/database';
import { useGmailConnectionStatus } from '@/hooks/use-gmail-connection';

const CONFIDENCE_COLORS = {
  high: 'bg-green-500',
  medium: 'bg-yellow-500',
  low: 'bg-orange-500',
  none: 'bg-red-500',
  manual: 'bg-blue-500',
};

const STATUS_BADGES = {
  pending: { variant: 'secondary' as const, label: 'Pending' },
  matched: { variant: 'secondary' as const, label: 'Matched' },
  auto_processed: { variant: 'default' as const, label: 'Auto-Processed' },
  queued_for_review: { variant: 'outline' as const, label: 'Queued' },
  processed: { variant: 'default' as const, label: 'Processed' },
  skipped: { variant: 'secondary' as const, label: 'Skipped' },
  error: { variant: 'destructive' as const, label: 'Error' },
};

export default function EmailImportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const importId = params.importId as string;
  const { data: connectionStatus, isLoading: connectionLoading } = useGmailConnectionStatus();

  const [statusFilter, setStatusFilter] = useState<string>('queued_for_review');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState<EmailTransaction | null>(null);
  const [selectedResidentId, setSelectedResidentId] = useState<string>('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [saveAsAlias, setSaveAsAlias] = useState(false);
  const [aliasName, setAliasName] = useState('');
  const [skipReason, setSkipReason] = useState('');
  const [isProcessDialogOpen, setIsProcessDialogOpen] = useState(false);
  const [isSkipDialogOpen, setIsSkipDialogOpen] = useState(false);

  // Fetch import details
  const { data: importData, isLoading: importLoading } = useQuery({
    queryKey: ['email-import', importId],
    queryFn: async () => {
      const result = await getEmailImport(importId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });

  // Fetch transactions
  const { data: transactionsData, isLoading: txLoading } = useQuery({
    queryKey: ['email-transactions', importId, statusFilter, page, pageSize],
    queryFn: async () => {
      const result = await getReviewQueue({
        importId,
        status: statusFilter,
        limit: pageSize,
        offset: (page - 1) * pageSize
      });
      if (result.error) throw new Error(result.error);
      return result;
    },
  })

  // Calculate total pages
  const totalPages = Math.ceil((transactionsData?.count || 0) / pageSize);

  // Fetch residents for selection
  const { data: residents } = useQuery({
    queryKey: ['residents-list'],
    queryFn: async () => {
      const result = await getActiveResidents();
      if (result.error) {
        console.error('Failed to fetch residents:', result.error);
        throw new Error(result.error);
      }
      return result.data || [];
    },
    staleTime: 0,
  });

  // Process mutation
  const processMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTransaction || !selectedResidentId) {
        throw new Error('Select a resident');
      }
      const result = await processSingleTransaction(selectedTransaction.id, {
        residentId: selectedResidentId,
        notes: reviewNotes || undefined,
        saveAsAlias,
        aliasName: saveAsAlias ? aliasName.trim() : undefined,
      });
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success('Transaction processed successfully');
      queryClient.invalidateQueries({ queryKey: ['email-transactions', importId] });
      queryClient.invalidateQueries({ queryKey: ['email-import', importId] });
      handleCloseProcessDialog();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to process transaction');
    },
  });

  // Skip mutation
  const skipMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTransaction || !skipReason.trim()) {
        throw new Error('Enter a reason for skipping');
      }
      const result = await skipTransaction(selectedTransaction.id, skipReason.trim());
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success('Transaction skipped');
      queryClient.invalidateQueries({ queryKey: ['email-transactions', importId] });
      queryClient.invalidateQueries({ queryKey: ['email-import', importId] });
      handleCloseSkipDialog();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to skip transaction');
    },
  });

  const handleOpenProcessDialog = (tx: EmailTransaction) => {
    setSelectedTransaction(tx);
    setSelectedResidentId(tx.matched_resident_id || '');
    setReviewNotes('');
    setSaveAsAlias(false);
    // Pre-populate alias name from enhanced extraction or fallback to description
    const extractedName = tx.description ? extractSenderName(tx.description) : null;
    setAliasName(extractedName || tx.description || '');
    setIsProcessDialogOpen(true);
  };

  const handleCloseProcessDialog = () => {
    setSelectedTransaction(null);
    setSelectedResidentId('');
    setReviewNotes('');
    setSaveAsAlias(false);
    setAliasName('');
    setIsProcessDialogOpen(false);
  };

  const handleOpenSkipDialog = (tx: EmailTransaction) => {
    setSelectedTransaction(tx);
    setSkipReason('');
    setIsSkipDialogOpen(true);
  };

  const handleCloseSkipDialog = () => {
    setSelectedTransaction(null);
    setSkipReason('');
    setIsSkipDialogOpen(false);
  };

  const formatCurrency = (amount: number | string | null | undefined) => {
    if (amount === null || amount === undefined) return '-';
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return `₦${num.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  };

  const formatDate = (date: string | null | undefined) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString();
  };

  if (importLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!importData) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Import not found</p>
        <Button variant="link" onClick={() => router.push('/payments/email-imports')}>
          Back to imports
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Email Import Details</h1>
          <p className="text-muted-foreground">
            {new Date(importData.created_at).toLocaleString()} • {importData.source_email}
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold">{importData.emails_fetched || 0}</p>
            <p className="text-xs text-muted-foreground">Emails Fetched</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold">{importData.transactions_extracted || 0}</p>
            <p className="text-xs text-muted-foreground">Total Found</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold">{importData.transactions_matched || 0}</p>
            <p className="text-xs text-muted-foreground">Matched</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-green-600">
              {importData.transactions_auto_processed || 0}
            </p>
            <p className="text-xs text-muted-foreground">Auto-Processed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-yellow-600">
              {importData.transactions_queued || 0}
            </p>
            <p className="text-xs text-muted-foreground">Queued</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-slate-500">
              {importData.transactions_skipped || 0}
            </p>
            <p className="text-xs text-muted-foreground">Skipped</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-red-600">
              {importData.transactions_errored || 0}
            </p>
            <p className="text-xs text-muted-foreground">Errors</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-slate-500">
              {(importData.transactions_extracted || 0) -
                ((importData.transactions_auto_processed || 0) +
                  (importData.transactions_queued || 0) +
                  (importData.transactions_skipped || 0) +
                  (importData.transactions_errored || 0))}
            </p>
            <p className="text-xs text-muted-foreground">Unmatched</p>
          </CardContent>
        </Card>
      </div>

      {/* Debug Section */}
      {connectionStatus?.syncCriteria?.show_debug_info && importData && (
        <Card className="bg-muted/30 border-dashed">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <Settings className="h-4 w-4 text-gray-500" />
              </div>
              <div>
                <CardTitle className="text-base">System Debug Information</CardTitle>
                <CardDescription>Technical details for troubleshooting</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {importData.error_message && (
              <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg text-sm text-red-600 dark:text-red-400">
                <p className="font-semibold mb-1">Error Message:</p>
                <pre className="whitespace-pre-wrap">{importData.error_message}</pre>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Import Summary (JSON)</h4>
                <div className="bg-slate-950 text-slate-50 p-4 rounded-lg text-xs overflow-auto max-h-60 font-mono">
                  <pre>{JSON.stringify(importData.import_summary || {}, null, 2)}</pre>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2">Sync Metrics</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">Import ID</span>
                    <span className="font-mono">{importData.id}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">Duration</span>
                    <span className="font-mono">
                      {importData.started_at && importData.completed_at
                        ? `${Math.round((new Date(importData.completed_at).getTime() - new Date(importData.started_at).getTime()) / 1000)}s`
                        : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">Skipped Emails</span>
                    <span className="font-mono">{importData.emails_skipped || 0}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">Skipped Transactions</span>
                    <span className="font-mono">{importData.transactions_skipped || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transactions Table */}
      <EnhancedTableCard
        title="Transactions"
        description="Review and process queued transactions"
      >
        {/* Integrated Toolbar */}
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          {/* Primary Search - flex-1 for maximum visibility */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by description, amount, or resident..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Filter Dropdown */}
          <Select
            value={statusFilter}
            onValueChange={(val) => {
              setStatusFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="queued_for_review">Queued for Review</SelectItem>
              <SelectItem value="pending">Pending (Unmatched)</SelectItem>
              <SelectItem value="matched">Matched (Pending)</SelectItem>
              <SelectItem value="auto_processed">Auto-Processed</SelectItem>
              <SelectItem value="processed">Processed</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Active Filter Badges */}
        {(statusFilter !== 'queued_for_review' || searchQuery) && (
          <div className="flex items-center gap-2 mb-4">
            {statusFilter !== 'queued_for_review' && (
              <Badge variant="secondary" className="gap-1">
                Status: {STATUS_BADGES[statusFilter as keyof typeof STATUS_BADGES]?.label || statusFilter}
                <button
                  onClick={() => {
                    setStatusFilter('queued_for_review');
                    setPage(1);
                  }}
                  className="ml-1 hover:bg-muted-foreground/20 rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {searchQuery && (
              <Badge variant="secondary" className="gap-1">
                Search: {searchQuery}
                <button
                  onClick={() => setSearchQuery('')}
                  className="ml-1 hover:bg-muted-foreground/20 rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => {
                setStatusFilter('queued_for_review');
                setSearchQuery('');
                setPage(1);
              }}
            >
              Clear all
            </Button>
          </div>
        )}

        {/* Table Wrapper */}
        <div className="rounded-xl border overflow-hidden shadow-soft animate-slide-up">
          <Table>
            <TableHeader>
              <TableRow interactive={false}>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Matched Resident</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
                  </TableRow>
                ))
              ) : !transactionsData?.data || transactionsData.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No transactions found in this status
                  </TableCell>
                </TableRow>
              ) : (
                transactionsData.data.map((tx: EmailTransaction & { residents?: { first_name: string; last_name: string; resident_code: string } }) => (
                  <TableRow key={tx.id} className="hover:bg-gray-50 dark:hover:bg-[#0F172A]">
                    <TableCell className="text-muted-foreground font-mono text-sm">
                      {formatDate(tx.transaction_date)}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate font-medium" title={tx.description || ''}>
                      {tx.description || '-'}
                    </TableCell>
                    <TableCell className="font-mono">
                      <span className={
                        tx.transaction_type === 'debit' ? 'text-red-600 dark:text-red-400' :
                          tx.transaction_type === 'credit' ? 'text-green-600 dark:text-green-400' :
                            ''
                      }>
                        {tx.transaction_type === 'debit' ? '-' :
                          tx.transaction_type === 'credit' ? '+' : ''}
                        {formatCurrency(tx.amount)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {tx.residents ? (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            {tx.residents.first_name} {tx.residents.last_name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ({tx.residents.resident_code})
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic">Unmatched</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {tx.match_confidence && (
                        <Badge className={`${CONFIDENCE_COLORS[tx.match_confidence]} text-white rounded-full`}>
                          {tx.match_confidence}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGES[tx.status]?.variant || 'secondary'} className="rounded-full">
                        {STATUS_BADGES[tx.status]?.label || tx.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {['queued_for_review', 'pending', 'matched'].includes(tx.status) && (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 text-green-600"
                            onClick={() => handleOpenProcessDialog(tx)}
                            title="Process"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 text-red-600"
                            onClick={() => handleOpenSkipDialog(tx)}
                            title="Skip"
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      {!['queued_for_review', 'pending', 'matched'].includes(tx.status) && (
                        <div className="flex justify-end">
                          <Button variant="ghost" size="sm" className="h-8 w-8">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </EnhancedTableCard>

      {/* Pagination Footer */}
      {transactionsData?.count && transactionsData.count > 0 && (
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
          {/* Left Section - Settings */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows per page</span>
              <Select
                value={pageSize.toString()}
                onValueChange={(val) => {
                  setPageSize(Number(val));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[70px] rounded-xl">
                  <SelectValue placeholder={pageSize.toString()} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">
              Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, transactionsData.count)} of {transactionsData.count} transactions
            </p>
          </div>

          {/* Right Section - Navigation */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="h-8 w-9 p-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={page === pageNum ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPage(pageNum)}
                    className="h-8 w-9 p-0"
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={page * pageSize >= (transactionsData.count || 0)}
              className="h-8 w-9 p-0"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Process Dialog */}
      <Dialog open={isProcessDialogOpen} onOpenChange={setIsProcessDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Transaction</DialogTitle>
            <DialogDescription>
              Confirm the resident and create a payment record.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Date</p>
                <p className="font-medium">{formatDate(selectedTransaction?.transaction_date)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Amount</p>
                <p className="font-medium">{formatCurrency(selectedTransaction?.amount)}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground">Description</p>
                <p className="font-medium">{selectedTransaction?.description || '-'}</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Assign to Resident</label>
              <Select value={selectedResidentId} onValueChange={setSelectedResidentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select resident" />
                </SelectTrigger>
                <SelectContent>
                  {residents?.map((resident) => (
                    <SelectItem key={resident.id} value={resident.id}>
                      {resident.first_name} {resident.last_name} ({resident.resident_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes (optional)</label>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Add notes about this transaction..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="saveAsAlias"
                  checked={saveAsAlias}
                  onCheckedChange={(checked) => setSaveAsAlias(checked as boolean)}
                />
                <Label htmlFor="saveAsAlias" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Save sender as alias for this resident
                </Label>
              </div>
              {saveAsAlias && (
                <div className="ml-6 space-y-1">
                  <label className="text-xs text-muted-foreground">Alias name</label>
                  <Input
                    value={aliasName}
                    onChange={(e) => setAliasName(e.target.value)}
                    placeholder="Enter the alias name to save"
                    className="h-8"
                  />
                  <p className="text-xs text-muted-foreground">
                    This name will be used for future automatic payment matching
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseProcessDialog}>
              Cancel
            </Button>
            <Button
              onClick={() => processMutation.mutate()}
              disabled={processMutation.isPending || !selectedResidentId}
            >
              {processMutation.isPending ? 'Processing...' : 'Create Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Skip Dialog */}
      <Dialog open={isSkipDialogOpen} onOpenChange={setIsSkipDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skip Transaction</DialogTitle>
            <DialogDescription>
              Enter a reason for skipping this transaction.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Amount</p>
                <p className="font-medium">{formatCurrency(selectedTransaction?.amount)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Description</p>
                <p className="font-medium">{selectedTransaction?.description || '-'}</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Reason</label>
              <Textarea
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
                placeholder="e.g., Duplicate, Not a payment, Unable to identify..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseSkipDialog}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => skipMutation.mutate()}
              disabled={skipMutation.isPending || !skipReason.trim()}
            >
              {skipMutation.isPending ? 'Skipping...' : 'Skip Transaction'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
