'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Loader2,
  Search,
  MoreHorizontal,
  Eye,
  Download,
  FileText,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { useImports, useBankAccounts } from '@/hooks/use-imports';
import { formatDistanceToNow } from 'date-fns';
import { getStatusBadge } from '@/components/imports/import-status-badge';
import { DeleteImportDialog, canDeleteImport } from '@/components/imports/delete-import-dialog';
import { useCan } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const ALL_VALUE = '_all';

type ImportStatus = 'pending' | 'processing' | 'awaiting_approval' | 'approved' | 'posting' | 'completed' | 'failed' | 'rejected';

interface ImportHistoryTableProps {
  onViewDetails?: (importId: string) => void;
}

export function ImportHistoryTable({ onViewDetails }: ImportHistoryTableProps) {
  const [statusFilter, setStatusFilter] = useState<string>(ALL_VALUE);
  const [accountFilter, setAccountFilter] = useState<string>(ALL_VALUE);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; fileName: string } | null>(null);
  const router = useRouter();
  const canDelete = useCan(PERMISSIONS.IMPORTS_CREATE);

  const openDetails = (importId: string) => {
    if (onViewDetails) onViewDetails(importId);
    else router.push(`/payments/import/${importId}`);
  };

  const { data: importsData, isLoading } = useImports({
    status: statusFilter === ALL_VALUE ? undefined : (statusFilter as ImportStatus),
    bank_account_id: accountFilter === ALL_VALUE ? undefined : accountFilter,
    page,
    limit: 20,
  });

  const { data: bankAccountsData } = useBankAccounts();

  const imports = importsData?.data || [];
  const bankAccounts = bankAccountsData?.data || [];
  const totalCount = importsData?.count || 0;
  const totalPages = Math.ceil(totalCount / 20);

  const filteredImports = imports.filter(imp => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return imp.file_name?.toLowerCase().includes(query);
    }
    return true;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by file name..."
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
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="awaiting_approval">Awaiting Approval</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="posting">Posting</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant={statusFilter === 'awaiting_approval' ? 'default' : 'outline'}
          onClick={() => {
            setStatusFilter(statusFilter === 'awaiting_approval' ? ALL_VALUE : 'awaiting_approval');
            setPage(1);
          }}
          aria-pressed={statusFilter === 'awaiting_approval'}
        >
          <AlertTriangle className="h-4 w-4 mr-2" />
          Needs approval
        </Button>
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by account" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All Accounts</SelectItem>
            {bankAccounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.account_number} - {account.bank_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Bank Account</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Rows</TableHead>
              <TableHead className="text-center">Created</TableHead>
              <TableHead className="text-center">Skipped</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredImports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No import history found</p>
                </TableCell>
              </TableRow>
            ) : (
              filteredImports.map((imp) => (
                <TableRow
                  key={imp.id}
                  className="cursor-pointer hover:bg-muted/50"
                  tabIndex={0}
                  onClick={() => openDetails(imp.id)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      openDetails(imp.id);
                    }
                  }}
                >
                  <TableCell>
                    <div>
                      <p className="font-medium">{imp.file_name}</p>
                      <p className="text-xs text-muted-foreground uppercase">
                        {imp.file_type}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {imp.bank_name || 'Unknown'}
                    </span>
                  </TableCell>
                  <TableCell>{getStatusBadge(imp.status)}</TableCell>
                  <TableCell className="text-center font-mono">
                    {imp.total_rows}
                  </TableCell>
                  <TableCell className="text-center font-mono text-green-600">
                    {imp.created_rows || 0}
                  </TableCell>
                  <TableCell className="text-center font-mono text-orange-600">
                    {imp.skipped_rows || 0}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {imp.created_at
                        ? formatDistanceToNow(new Date(imp.created_at), { addSuffix: true })
                        : '--'}
                    </span>
                  </TableCell>
                  {/* Menu events bubble through the portal; keep them off the row. */}
                  <TableCell
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Open actions menu">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => openDetails(imp.id)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        {imp.import_summary && (
                          <DropdownMenuItem>
                            <Download className="h-4 w-4 mr-2" />
                            Download Summary
                          </DropdownMenuItem>
                        )}
                        {canDelete && canDeleteImport(imp.status) && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget({ id: imp.id, fileName: imp.file_name })}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, totalCount)} of {totalCount} imports
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {deleteTarget && (
        <DeleteImportDialog
          importId={deleteTarget.id}
          fileName={deleteTarget.fileName}
          open
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}
