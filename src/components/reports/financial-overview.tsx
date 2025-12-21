'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Wallet,
  FileBarChart,
  Download,
  AlertCircle,
  Calendar,
} from 'lucide-react';
import {
  getFinancialOverview,
  getBankAccountsForFilter,
} from '@/actions/reports/get-financial-overview';
import type { TransactionTagColor, TransactionTagType } from '@/types/database';

// Type for financial overview result (defined inline since it's from 'use server' file)
type TagBreakdown = {
  tagId: string | null;
  tagName: string;
  tagColor: string;
  transactionType: TransactionTagType;
  count: number;
  total: number;
};

type FinancialOverviewResult = {
  summary: {
    totalCredits: number;
    totalDebits: number;
    netBalance: number;
    transactionCount: number;
  };
  byTag: TagBreakdown[];
  error?: string;
};

const ALL_VALUE = '_all';

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

// Get default date range (current month)
function getDefaultDateRange() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    startDate: startOfMonth.toISOString().split('T')[0],
    endDate: endOfMonth.toISOString().split('T')[0],
  };
}

export function FinancialOverview() {
  const defaultDates = getDefaultDateRange();
  const [startDate, setStartDate] = useState(defaultDates.startDate);
  const [endDate, setEndDate] = useState(defaultDates.endDate);
  const [transactionType, setTransactionType] = useState<string>(ALL_VALUE);
  const [bankAccountId, setBankAccountId] = useState<string>(ALL_VALUE);

  // Fetch bank accounts for filter
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank-accounts-filter'],
    queryFn: () => getBankAccountsForFilter(),
  });

  // Fetch financial overview data
  const {
    data: overviewData,
    isLoading,
    error,
    refetch,
  } = useQuery<FinancialOverviewResult>({
    queryKey: ['financial-overview', startDate, endDate, transactionType, bankAccountId],
    queryFn: () =>
      getFinancialOverview({
        startDate,
        endDate,
        transactionType: transactionType === ALL_VALUE ? 'all' : (transactionType as 'credit' | 'debit'),
        bankAccountId: bankAccountId === ALL_VALUE ? undefined : bankAccountId,
      }),
    enabled: Boolean(startDate && endDate),
  });

  const formatCurrency = (amount: number) => {
    return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleExportCsv = () => {
    if (!overviewData || !overviewData.byTag) return;

    const headers = ['Category', 'Transaction Type', 'Count', 'Total Amount'];
    const rows = overviewData.byTag.map((item) => [
      item.tagName,
      item.transactionType === 'credit' ? 'Income' : 'Expense',
      item.count.toString(),
      item.total.toFixed(2),
    ]);

    // Add summary row
    rows.push([]);
    rows.push(['Summary', '', '', '']);
    rows.push(['Total Income', '', '', overviewData.summary.totalCredits.toFixed(2)]);
    rows.push(['Total Expenses', '', '', overviewData.summary.totalDebits.toFixed(2)]);
    rows.push(['Net Balance', '', '', overviewData.summary.netBalance.toFixed(2)]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `financial-overview-${startDate}-to-${endDate}.csv`;
    link.click();
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load financial overview. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Report Filters
          </CardTitle>
          <CardDescription>
            Select date range and filters for the financial overview
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="transactionType">Transaction Type</Label>
              <Select value={transactionType} onValueChange={setTransactionType}>
                <SelectTrigger id="transactionType">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>All Types</SelectItem>
                  <SelectItem value="credit">Income (Credits)</SelectItem>
                  <SelectItem value="debit">Expenses (Debits)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankAccount">Bank Account</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger id="bankAccount">
                  <SelectValue placeholder="All Accounts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>All Accounts</SelectItem>
                  {bankAccounts?.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.account_name} ({account.account_number})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={() => refetch()}>
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : overviewData && !overviewData.error ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Income</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(overviewData.summary.totalCredits)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Credits received in period
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
                <TrendingDown className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {formatCurrency(overviewData.summary.totalDebits)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Debits in period
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Net Balance</CardTitle>
                <Wallet className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold ${
                    overviewData.summary.netBalance >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {formatCurrency(overviewData.summary.netBalance)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Income - Expenses
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Transactions</CardTitle>
                <FileBarChart className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {overviewData.summary.transactionCount.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total transactions in period
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Breakdown by Tag */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Category Breakdown</CardTitle>
                <CardDescription>
                  Transactions grouped by category tags
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleExportCsv}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Transactions</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overviewData.byTag.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          No transactions found for the selected period
                        </TableCell>
                      </TableRow>
                    ) : (
                      overviewData.byTag.map((item, index) => (
                        <TableRow key={item.tagId || `untagged-${index}`}>
                          <TableCell>
                            <Badge
                              className={tagColorVariants[(item.tagColor as TransactionTagColor) || 'gray']}
                            >
                              {item.tagName}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={item.transactionType === 'credit' ? 'default' : 'secondary'}
                            >
                              {item.transactionType === 'credit' ? 'Income' : 'Expense'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {item.count.toLocaleString()}
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono ${
                              item.transactionType === 'credit'
                                ? 'text-green-600'
                                : 'text-red-600'
                            }`}
                          >
                            {formatCurrency(item.total)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : overviewData?.error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{overviewData.error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
