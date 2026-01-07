'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  Inbox,
  Loader2,
  Mail,
  Settings,
  XCircle,
} from 'lucide-react';
import { listEmailImports } from '@/actions/email-imports/create-email-import';
import type { EmailImport, EmailImportStatus } from '@/types/database';

const STATUS_COLORS: Record<EmailImportStatus, string> = {
  pending: 'bg-gray-500',
  fetching: 'bg-blue-500',
  parsing: 'bg-blue-500',
  matching: 'bg-yellow-500',
  processing: 'bg-yellow-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
};

const STATUS_ICONS: Record<EmailImportStatus, React.ReactNode> = {
  pending: <Clock className="h-4 w-4" />,
  fetching: <Loader2 className="h-4 w-4 animate-spin" />,
  parsing: <Loader2 className="h-4 w-4 animate-spin" />,
  matching: <Loader2 className="h-4 w-4 animate-spin" />,
  processing: <Loader2 className="h-4 w-4 animate-spin" />,
  completed: <CheckCircle2 className="h-4 w-4" />,
  failed: <XCircle className="h-4 w-4" />,
};

export default function EmailImportsPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data, isLoading, error } = useQuery({
    queryKey: ['email-imports', statusFilter],
    queryFn: async () => {
      const result = await listEmailImports({
        status: statusFilter === 'all' ? undefined : (statusFilter as EmailImportStatus),
        limit: 50,
      });
      if (result.error) throw new Error(result.error);
      return result;
    },
  });

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleString();
  };

  const formatDuration = (start: string | null, end: string | null) => {
    if (!start) return '-';
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date();
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    if (diffSecs < 60) return `${diffSecs}s`;
    const diffMins = Math.floor(diffSecs / 60);
    return `${diffMins}m ${diffSecs % 60}s`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Email Imports</h1>
          <p className="text-muted-foreground mt-1">
            View history of email import sessions and review queued transactions.
          </p>
        </div>
        <Button variant="outline" asChild>
          <a href="/settings/email-integration">
            <Settings className="h-4 w-4 mr-2" />
            Configure
          </a>
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-950 rounded-lg">
                <Mail className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{data?.count || 0}</p>
                <p className="text-sm text-muted-foreground">Total Imports</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 dark:bg-green-950 rounded-lg">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {data?.data?.filter((i) => i.status === 'completed').length || 0}
                </p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-yellow-100 dark:bg-yellow-950 rounded-lg">
                <Inbox className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {data?.data?.reduce((sum, i) => sum + (i.transactions_queued || 0), 0) || 0}
                </p>
                <p className="text-sm text-muted-foreground">Queued for Review</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-100 dark:bg-purple-950 rounded-lg">
                <FileText className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {data?.data?.reduce((sum, i) => sum + (i.transactions_auto_processed || 0), 0) || 0}
                </p>
                <p className="text-sm text-muted-foreground">Auto-Processed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Import History Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Import History</CardTitle>
              <CardDescription>Recent email import sessions</CardDescription>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 text-destructive">
              Failed to load imports: {error.message}
            </div>
          ) : !data?.data || data.data.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No email imports yet. Connect Gmail in settings to start.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Emails</TableHead>
                  <TableHead>Transactions</TableHead>
                  <TableHead>Auto-Processed</TableHead>
                  <TableHead>Queued</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((importItem: EmailImport) => (
                  <TableRow key={importItem.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(importItem.created_at)}
                    </TableCell>
                    <TableCell className="max-w-32 truncate" title={importItem.source_email}>
                      {importItem.source_email}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {importItem.trigger_type}
                      </Badge>
                    </TableCell>
                    <TableCell>{importItem.emails_fetched || 0}</TableCell>
                    <TableCell>{importItem.transactions_extracted || 0}</TableCell>
                    <TableCell>{importItem.transactions_auto_processed || 0}</TableCell>
                    <TableCell>
                      {(importItem.transactions_queued || 0) > 0 ? (
                        <Badge variant="secondary">
                          {importItem.transactions_queued}
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`${STATUS_COLORS[importItem.status]} text-white`}
                      >
                        <span className="flex items-center gap-1">
                          {STATUS_ICONS[importItem.status]}
                          {importItem.status}
                        </span>
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatDuration(importItem.started_at, importItem.completed_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/payments/email-imports/${importItem.id}`)}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
