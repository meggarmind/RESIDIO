'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Search,
  UserPlus,
  SkipForward,
  X,
  Eye,
  Sparkles,
  TableIcon,
  BarChart3,
} from 'lucide-react';
import { PaginationControls } from '@/components/ui/pagination-controls';
import {
  useCreateImport,
  useCreateImportRows,
  useMatchImportRows,
  useImportRows,
  useImportRowSummary,
  useImportBreakdown,
  useUnmatchRow,
  useSkipRow,
} from '@/hooks/use-imports';
import { useTransactionTags } from '@/hooks/use-reference';
import { tagImportRow } from '@/actions/reference/transaction-tags';
import { ManualMatchDialog } from './manual-match-dialog';
import { RowDetailsDialog } from './row-details-dialog';
import { ImportBreakdown } from './import-breakdown';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ParsedRow } from '@/lib/validators/import';
import type { BankStatementRow, ColumnMapping, TransactionTag, TransactionTagColor } from '@/types/database';

const ALL_VALUE = '_all';
const NONE_TAG = '_none';

// Color badge variants for transaction tags
const tagColorVariants: Record<TransactionTagColor, string> = {
  gray: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  red: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

// UI column mapping for the wizard (dual Withdrawal/Deposit columns for Nigerian bank statements)
interface UIColumnMapping {
  date: string;
  description: string;
  withdrawal: string;  // Maps to debit/outgoing transactions
  deposit: string;     // Maps to credit/incoming transactions
  reference: string | null;
  // Transaction type is auto-detected based on which column has value
}

// Convert UI mapping to database mapping format
function uiToDbMapping(uiMapping: UIColumnMapping): ColumnMapping {
  return {
    date: uiMapping.date,
    description: uiMapping.description,
    credit: uiMapping.deposit,    // Deposit column maps to credit
    debit: uiMapping.withdrawal,  // Withdrawal column maps to debit
    reference: uiMapping.reference || '',
    balance: undefined,
  };
}

interface ImportPreviewProps {
  parsedRows: ParsedRow[];
  columnMapping: UIColumnMapping;
  bankAccountId: string;
  fileName: string;
  fileType: 'csv' | 'xlsx';
  onComplete: (importId: string) => void;
  onBack: () => void;
}

export function ImportPreview({
  parsedRows,
  columnMapping,
  bankAccountId,
  fileName,
  fileType,
  onComplete,
  onBack,
}: ImportPreviewProps) {
  const [importId, setImportId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [matchingComplete, setMatchingComplete] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [statusFilter, setStatusFilter] = useState<string>(ALL_VALUE);
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<'all' | 'credit' | 'debit'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRow, setSelectedRow] = useState<BankStatementRow | null>(null);
  const [showMatchDialog, setShowMatchDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'breakdown'>('table');

  const createImportMutation = useCreateImport();
  const createRowsMutation = useCreateImportRows();
  const matchRowsMutation = useMatchImportRows();
  const unmatchRowMutation = useUnmatchRow();
  const skipRowMutation = useSkipRow();

  const {
    data: rowsData,
    refetch: refetchRows,
    isLoading: isLoadingRows,
    isFetching: isFetchingRows,
    error: rowsError
  } = useImportRows(importId || '', {
    status: statusFilter === ALL_VALUE ? undefined : statusFilter as BankStatementRow['status'],
    page,
    limit: pageSize,
  });
  const {
    data: summaryData,
    refetch: refetchSummary,
    isLoading: isLoadingSummary,
    isFetching: isFetchingSummary
  } = useImportRowSummary(importId || '');

  const { data: creditTags } = useTransactionTags({ transaction_type: 'credit' });
  const { data: debitTags } = useTransactionTags({ transaction_type: 'debit' });
  const { data: breakdownData } = useImportBreakdown(importId || '');

  const rows = rowsData?.data || [];
  const totalCount = rowsData?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);
  const summary = summaryData;

  // Composite loading state
  const isInitializing = isCreating || isMatching;
  const isLoadingData = importId ? (isLoadingRows || isLoadingSummary) : false;
  const isRefetching = isFetchingRows || isFetchingSummary;
  const showLoadingScreen = isInitializing || isLoadingData;

  // Get tags filtered by row's transaction type
  const getTagsForRow = (row: BankStatementRow): TransactionTag[] => {
    if (row.transaction_type === 'credit') {
      return creditTags || [];
    } else if (row.transaction_type === 'debit') {
      return debitTags || [];
    }
    // If no transaction type, show all tags
    return [...(creditTags || []), ...(debitTags || [])];
  };

  // Handle tag selection for a row
  const handleTagChange = async (rowId: string, tagId: string) => {
    const result = await tagImportRow(rowId, tagId === NONE_TAG ? null : tagId);
    if (result.error) {
      toast.error(result.error);
    } else {
      await refetchRows();
    }
  };

  // Create import and rows on mount
  useEffect(() => {
    const initializeImport = async () => {
      if (importId || isCreating) return;

      setIsCreating(true);
      setError(null);

      try {
        // Create import record
        // Note: transaction_type is auto-detected per-row during mapping stage
        const importResult = await createImportMutation.mutateAsync({
          file_name: fileName,
          file_type: fileType,
          bank_account_id: bankAccountId,
          transaction_filter: 'all', // All rows imported; type is per-row
          total_rows: parsedRows.length,
          column_mapping: uiToDbMapping(columnMapping),
        });

        if (!importResult.data?.id) {
          throw new Error('Failed to create import record');
        }

        const newImportId = importResult.data.id;
        setImportId(newImportId);

        // Create rows - use all parsed rows (transaction_type is per-row)
        await createRowsMutation.mutateAsync({
          import_id: newImportId,
          rows: parsedRows,
        });

        // Start matching
        setIsMatching(true);
        await matchRowsMutation.mutateAsync(newImportId);

        // CRITICAL: Await refetch operations before marking complete
        await Promise.all([
          refetchRows(),
          refetchSummary()
        ]);

        setMatchingComplete(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to initialize import';
        setError(message);
      } finally {
        setIsCreating(false);
        setIsMatching(false);
      }
    };

    initializeImport();
  }, []);

  const handleManualMatch = (row: BankStatementRow) => {
    setSelectedRow(row);
    setShowMatchDialog(true);
  };

  const handleMatchComplete = async () => {
    setShowMatchDialog(false);
    setSelectedRow(null);
    await Promise.all([
      refetchRows(),
      refetchSummary()
    ]);
  };

  const handleClearMatch = async (rowId: string) => {
    try {
      await unmatchRowMutation.mutateAsync(rowId);
      await Promise.all([
        refetchRows(),
        refetchSummary()
      ]);
    } catch {
      // Error already handled by mutation
    }
  };

  const handleSkipRow = async (rowId: string) => {
    try {
      await skipRowMutation.mutateAsync(rowId);
      await Promise.all([
        refetchRows(),
        refetchSummary()
      ]);
    } catch {
      // Error already handled by mutation
    }
  };

  const handleViewDetails = (row: BankStatementRow) => {
    setSelectedRow(row);
    setShowDetailsDialog(true);
  };

  const handleContinue = () => {
    if (importId) {
      onComplete(importId);
    }
  };

  // Calculate counts for transaction types
  const transactionCounts = useMemo(() => {
    const credits = rows.filter(r => r.transaction_type === 'credit');
    const debits = rows.filter(r => r.transaction_type === 'debit');
    return {
      credit: credits.length,
      debit: debits.length,
      creditMatched: credits.filter(r => r.status === 'matched').length,
      debitMatched: debits.filter(r => r.status === 'matched').length,
      creditTotal: credits.reduce((sum, r) => sum + (r.amount || 0), 0),
      debitTotal: debits.reduce((sum, r) => sum + (r.amount || 0), 0),
    };
  }, [rows]);

  // Filter displayed rows
  const displayRows = useMemo(() => {
    let filtered = rows;

    // Filter by transaction type
    if (transactionTypeFilter !== 'all') {
      filtered = filtered.filter(row => row.transaction_type === transactionTypeFilter);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(row =>
        row.description?.toLowerCase().includes(query) ||
        row.reference?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [rows, searchQuery, transactionTypeFilter]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, transactionTypeFilter, searchQuery]);

  const getStatusBadge = (status: string, transactionType: 'credit' | 'debit' | null, confidence?: string) => {
    // Handle pending status (no color variation needed)
    if (status === 'pending') {
      return (
        <Badge variant="secondary" className="gap-1">
          <HelpCircle className="h-3 w-3" />
          Pending
        </Badge>
      );
    }

    // Determine badge configuration based on status + transaction type
    let badgeConfig: { className: string; icon: React.ReactNode; label: string };

    if (status === 'matched') {
      if (transactionType === 'credit') {
        // Matched CR - Green
        badgeConfig = {
          className: 'bg-green-100 text-green-800 border-green-300 hover:bg-green-100',
          icon: <CheckCircle2 className="h-3 w-3" />,
          label: 'Matched'
        };
      } else if (transactionType === 'debit') {
        // Matched DR - Blue
        badgeConfig = {
          className: 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-100',
          icon: <CheckCircle2 className="h-3 w-3" />,
          label: 'Matched'
        };
      } else {
        // Matched (unknown type) - Default green
        badgeConfig = {
          className: 'bg-green-100 text-green-800 border-green-300 hover:bg-green-100',
          icon: <CheckCircle2 className="h-3 w-3" />,
          label: 'Matched'
        };
      }
    } else if (status === 'unmatched') {
      if (transactionType === 'credit') {
        // Unmatched CR - Orange
        badgeConfig = {
          className: 'bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-100',
          icon: <XCircle className="h-3 w-3" />,
          label: 'Unmatched'
        };
      } else {
        // Unmatched DR - Red (use destructive variant for debit or unknown)
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Unmatched
          </Badge>
        );
      }
    } else {
      // Unknown status - fallback
      return <Badge variant="outline">{status}</Badge>;
    }

    // Render the badge with custom colors
    return (
      <Badge variant="outline" className={cn('gap-1', badgeConfig.className)}>
        {badgeConfig.icon}
        {badgeConfig.label}
        {confidence && (
          <span className="text-xs opacity-75">({confidence})</span>
        )}
      </Badge>
    );
  };

  const getConfidenceBadge = (confidence: string | null) => {
    if (!confidence || confidence === 'none') return null;

    const configs: Record<string, { variant: 'default' | 'secondary' | 'outline'; className: string }> = {
      high: { variant: 'default', className: 'bg-green-600 hover:bg-green-600' },
      medium: { variant: 'secondary', className: 'bg-yellow-500 text-black hover:bg-yellow-500' },
      low: { variant: 'outline', className: 'border-orange-500 text-orange-600' },
      manual: { variant: 'default', className: 'bg-blue-600 hover:bg-blue-600' },
    };

    const config = configs[confidence] || { variant: 'outline' as const, className: '' };

    return (
      <Badge variant={config.variant} className={cn('text-xs', config.className)}>
        {confidence}
      </Badge>
    );
  };

  if (rowsError) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Transactions</AlertTitle>
          <AlertDescription>
            {rowsError instanceof Error ? rowsError.message : 'Failed to load transaction rows'}
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>
    );
  }

  if (showLoadingScreen) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg font-medium">
          {isCreating
            ? 'Creating import...'
            : isMatching
              ? 'Matching residents...'
              : 'Loading data...'}
        </p>
        <p className="text-sm text-muted-foreground">
          This may take a moment for large files
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      {summary && (
        <div className="space-y-4">
          {/* Main stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 border rounded-lg text-center min-h-[88px] flex flex-col justify-center">
              <p className="text-2xl font-bold">{summary.total}</p>
              <p className="text-sm text-muted-foreground">Total Rows</p>
              <p className="text-xs text-transparent mt-1 select-none">&nbsp;</p>
            </div>
            <div className="p-4 border rounded-lg text-center border-green-200 dark:border-green-800 min-h-[88px] flex flex-col justify-center">
              <p className="text-2xl font-bold text-green-600">{summary.matched}</p>
              <p className="text-sm text-muted-foreground">Matched</p>
              <p className="text-xs text-muted-foreground mt-1">
                ({transactionCounts.creditMatched} CR / {transactionCounts.debitMatched} DR)
              </p>
            </div>
            <div className="p-4 border rounded-lg text-center border-red-200 dark:border-red-800 min-h-[88px] flex flex-col justify-center">
              <p className="text-2xl font-bold text-red-600">{summary.unmatched}</p>
              <p className="text-sm text-muted-foreground">Unmatched</p>
              <p className="text-xs text-transparent mt-1 select-none">&nbsp;</p>
            </div>
            <div className="p-4 border rounded-lg text-center border-yellow-200 dark:border-yellow-800 min-h-[88px] flex flex-col justify-center">
              <p className="text-2xl font-bold text-yellow-600">{summary.pending}</p>
              <p className="text-sm text-muted-foreground">Pending</p>
              <p className="text-xs text-transparent mt-1 select-none">&nbsp;</p>
            </div>
          </div>

          {/* Credit/Debit breakdown row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 border rounded-lg border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowDownLeft className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-green-700 dark:text-green-400">Credits (In)</span>
                </div>
                <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                  {breakdownData?.credits.count ?? 0}
                </Badge>
              </div>
              <p className="text-xl font-bold text-green-700 dark:text-green-400 mt-2">
                ₦{(breakdownData?.credits.total ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
              </p>
              {transactionCounts.credit > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  This page: {transactionCounts.credit} (₦{transactionCounts.creditTotal.toLocaleString('en-NG', { minimumFractionDigits: 2 })})
                </p>
              )}
            </div>
            <div className="p-4 border rounded-lg border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowUpRight className="h-5 w-5 text-red-600" />
                  <span className="font-medium text-red-700 dark:text-red-400">Debits (Out)</span>
                </div>
                <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">
                  {breakdownData?.debits.count ?? 0}
                </Badge>
              </div>
              <p className="text-xl font-bold text-red-700 dark:text-red-400 mt-2">
                ₦{(breakdownData?.debits.total ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
              </p>
              {transactionCounts.debit > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  This page: {transactionCounts.debit} (₦{transactionCounts.debitTotal.toLocaleString('en-NG', { minimumFractionDigits: 2 })})
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* View Mode Tabs and Filters */}
      <div className="space-y-4">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'table' | 'breakdown')}>
          <TabsList>
            <TabsTrigger value="table" className="gap-2">
              <TableIcon className="h-4 w-4" />
              Table View
            </TabsTrigger>
            <TabsTrigger value="breakdown" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Breakdown
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {viewMode === 'table' && (
          <div className="space-y-4">
            {/* Transaction Type Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Show:</span>
              <div className="flex border rounded-lg overflow-hidden">
                <Button
                  variant={transactionTypeFilter === 'all' ? 'default' : 'ghost'}
                  size="sm"
                  className={cn(
                    'rounded-none border-0',
                    transactionTypeFilter === 'all' && 'bg-primary'
                  )}
                  onClick={() => setTransactionTypeFilter('all')}
                >
                  All ({rows.length})
                </Button>
                <Button
                  variant={transactionTypeFilter === 'credit' ? 'default' : 'ghost'}
                  size="sm"
                  className={cn(
                    'rounded-none border-0 gap-1',
                    transactionTypeFilter === 'credit' && 'bg-green-600 hover:bg-green-700'
                  )}
                  onClick={() => setTransactionTypeFilter('credit')}
                >
                  <ArrowDownLeft className="h-3 w-3" />
                  Credits ({transactionCounts.credit})
                </Button>
                <Button
                  variant={transactionTypeFilter === 'debit' ? 'default' : 'ghost'}
                  size="sm"
                  className={cn(
                    'rounded-none border-0 gap-1',
                    transactionTypeFilter === 'debit' && 'bg-red-600 hover:bg-red-700'
                  )}
                  onClick={() => setTransactionTypeFilter('debit')}
                >
                  <ArrowUpRight className="h-3 w-3" />
                  Debits ({transactionCounts.debit})
                </Button>
              </div>
            </div>

            {/* Search and Status Filter */}
            <div className="flex flex-wrap gap-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search description or reference..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>All Status</SelectItem>
                  <SelectItem value="matched">Matched</SelectItem>
                  <SelectItem value="unmatched">Unmatched</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Subtle loading indicator during refetch */}
      {isRefetching && !showLoadingScreen && (
        <div className="flex items-center justify-center py-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          <span className="text-sm">Updating...</span>
        </div>
      )}

      {/* Breakdown View */}
      {viewMode === 'breakdown' && importId && (
        <ImportBreakdown importId={importId} />
      )}

      {/* Rows Table */}
      {viewMode === 'table' && (
        <>
          <div className="border rounded-lg overflow-hidden max-h-[600px] overflow-y-auto relative">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead className="w-20">Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Resident</TableHead>
                  <TableHead className="w-[150px]">Tag</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      {searchQuery ? (
                        <span className="text-muted-foreground">
                          No rows match your search: &ldquo;{searchQuery}&rdquo;
                        </span>
                      ) : statusFilter !== ALL_VALUE ? (
                        <span className="text-muted-foreground">
                          No rows with status: {statusFilter}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          No rows to display
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  displayRows.map((row) => {
                    const availableTags = getTagsForRow(row as BankStatementRow);
                    const currentTagId = row.tag_id || NONE_TAG;
                    const isCredit = row.transaction_type === 'credit';
                    const isDebit = row.transaction_type === 'debit';

                    return (
                      <TableRow
                        key={row.id}
                        className={cn(
                          'hover:bg-muted/50 transition-colors',
                          isCredit && 'border-l-4 border-l-green-500',
                          isDebit && 'border-l-4 border-l-red-500'
                        )}
                      >
                        <TableCell className="font-mono text-sm">{row.row_number}</TableCell>
                        <TableCell>
                          {row.transaction_type === 'credit' ? (
                            <Badge variant="outline" className="gap-1 bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                              <ArrowDownLeft className="h-3 w-3" />
                              CR
                            </Badge>
                          ) : row.transaction_type === 'debit' ? (
                            <Badge variant="outline" className="gap-1 bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800">
                              <ArrowUpRight className="h-3 w-3" />
                              DR
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">--</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.transaction_date
                            ? new Date(row.transaction_date).toLocaleDateString()
                            : '--'}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate" title={row.description || ''}>
                          {row.description || '--'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          ₦{(row.amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(row.status, row.transaction_type)}
                            {row.match_confidence && getConfidenceBadge(row.match_confidence)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {row.matched_resident_id ? (
                            <span className="text-sm">
                              {(row as any).resident?.first_name} {(row as any).resident?.last_name}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">--</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Select
                              value={currentTagId}
                              onValueChange={(value) => handleTagChange(row.id, value)}
                            >
                              <SelectTrigger className="h-8 w-full">
                                <SelectValue placeholder="Select tag" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE_TAG}>
                                  <span className="text-muted-foreground">No tag</span>
                                </SelectItem>
                                {availableTags.map((tag) => (
                                  <SelectItem key={tag.id} value={tag.id}>
                                    <div className="flex items-center gap-2">
                                      <span className={`w-2 h-2 rounded-full ${(tagColorVariants[tag.color] || 'bg-gray-100').split(' ')[0]}`} />
                                      {tag.name}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {row.auto_tagged && row.tag_id && (
                              <Badge
                                variant="outline"
                                className="h-5 px-1.5 text-xs bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800"
                                title="Auto-tagged based on keyword match"
                              >
                                <Sparkles className="h-3 w-3 mr-0.5" />
                                Auto
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {/* Manual Match Button */}
                            {(row.status === 'unmatched' || row.status === 'pending') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleManualMatch(row as BankStatementRow)}
                                title="Manually assign resident"
                              >
                                <UserPlus className="h-4 w-4" />
                              </Button>
                            )}

                            {/* Clear Match Button */}
                            {row.status === 'matched' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleClearMatch(row.id)}
                                title="Clear match"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}

                            {/* Skip Row Button */}
                            {row.status !== 'skipped' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSkipRow(row.id)}
                                title="Skip this transaction"
                              >
                                <SkipForward className="h-4 w-4" />
                              </Button>
                            )}

                            {/* View Details Button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewDetails(row as BankStatementRow)}
                              title="View full details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          <PaginationControls
            currentPage={page}
            totalPages={totalPages}
            pageSize={pageSize}
            totalCount={totalCount}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            pageSizeOptions={[10, 20, 50, 100, 200]}
          />
        </>

      )}

      {/* Warning for unmatched rows */}
      {
        summary && summary.unmatched > 0 && (
          <Alert variant="destructive" className="border-yellow-600 bg-yellow-50 text-yellow-900 dark:border-yellow-400 dark:bg-yellow-950 dark:text-yellow-100">
            <AlertTriangle className="h-5 w-5" />
            <AlertTitle className="font-semibold">Attention Required</AlertTitle>
            <AlertDescription>
              <strong>{summary.unmatched}</strong> transaction(s) have not been matched to residents and will be{' '}
              <strong>skipped during processing</strong> unless you manually assign them.
              Use the <UserPlus className="inline h-3.5 w-3.5" /> button to match these transactions.
            </AlertDescription>
          </Alert>
        )
      }

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button onClick={handleContinue} disabled={!matchingComplete} size="lg">
          Continue to Confirmation
        </Button>
      </div>

      {/* Manual Match Dialog */}
      <ManualMatchDialog
        open={showMatchDialog}
        onOpenChange={setShowMatchDialog}
        row={selectedRow}
        onComplete={handleMatchComplete}
      />

      {/* Row Details Dialog */}
      <RowDetailsDialog
        open={showDetailsDialog}
        onOpenChange={setShowDetailsDialog}
        row={selectedRow}
      />
    </div >
  );
}
