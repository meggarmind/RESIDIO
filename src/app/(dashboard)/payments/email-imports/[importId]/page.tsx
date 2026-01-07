'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  CheckCircle2,
  Clock,
  Eye,
  Search,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { getEmailImport } from '@/actions/email-imports/create-email-import';
import {
  getReviewQueue,
  processSingleTransaction,
  skipTransaction,
} from '@/actions/email-imports/process-email-import';
import { getActiveResidents } from '@/actions/residents/get-residents';
import type { EmailImport, EmailTransaction } from '@/types/database';

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

  const [statusFilter, setStatusFilter] = useState<string>('queued_for_review');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState<EmailTransaction | null>(null);
  const [selectedResidentId, setSelectedResidentId] = useState<string>('');
  const [reviewNotes, setReviewNotes] = useState('');
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
    queryKey: ['email-transactions', importId, statusFilter],
    queryFn: async () => {
      // Use getReviewQueue for now, can extend to support other statuses
      const result = await getReviewQueue({ importId, limit: 100 });
      if (result.error) throw new Error(result.error);
      return result;
    },
    enabled: statusFilter === 'queued_for_review',
  });

  // Fetch residents for selection
  const { data: residents } = useQuery({
    queryKey: ['residents-list'],
    queryFn: async () => {
      const result = await getActiveResidents();
      return result.data || [];
    },
    staleTime: 60000,
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
    setIsProcessDialogOpen(true);
  };

  const handleCloseProcessDialog = () => {
    setSelectedTransaction(null);
    setSelectedResidentId('');
    setReviewNotes('');
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

  const formatCurrency = (amount: number | string | null) => {
    if (amount === null) return '-';
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return `₦${num.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  };

  const formatDate = (date: string | null) => {
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
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold">{importData.emails_fetched || 0}</p>
            <p className="text-xs text-muted-foreground">Emails Fetched</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold">{importData.transactions_extracted || 0}</p>
            <p className="text-xs text-muted-foreground">Transactions</p>
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
            <p className="text-2xl font-bold text-red-600">
              {importData.transactions_errored || 0}
            </p>
            <p className="text-xs text-muted-foreground">Errors</p>
          </CardContent>
        </Card>
      </div>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Transactions</CardTitle>
              <CardDescription>Review and process queued transactions</CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-48"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="queued_for_review">Queued for Review</SelectItem>
                  <SelectItem value="auto_processed">Auto-Processed</SelectItem>
                  <SelectItem value="processed">Processed</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {txLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !transactionsData?.data || transactionsData.data.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No transactions in this status
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Matched Resident</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactionsData.data.map((tx: EmailTransaction & { residents?: { first_name: string; last_name: string; resident_code: string } }) => (
                  <TableRow key={tx.id}>
                    <TableCell>{formatDate(tx.transaction_date)}</TableCell>
                    <TableCell className="max-w-48 truncate" title={tx.description || ''}>
                      {tx.description || '-'}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(tx.amount)}
                    </TableCell>
                    <TableCell>
                      {tx.residents ? (
                        <span className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {tx.residents.first_name} {tx.residents.last_name}
                          <span className="text-xs text-muted-foreground">
                            ({tx.residents.resident_code})
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Unmatched</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {tx.match_confidence && (
                        <Badge className={`${CONFIDENCE_COLORS[tx.match_confidence]} text-white`}>
                          {tx.match_confidence}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGES[tx.status]?.variant || 'secondary'}>
                        {STATUS_BADGES[tx.status]?.label || tx.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {tx.status === 'queued_for_review' && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenProcessDialog(tx)}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Process
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenSkipDialog(tx)}
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      {tx.status !== 'queued_for_review' && (
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
