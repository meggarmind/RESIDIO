'use client';

import { useState, memo, useCallback } from 'react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, Eye, FileText } from 'lucide-react';
import { format } from 'date-fns';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  type AuditLogWithActor,
} from '@/types/database';
import { getActionBadgeVariant } from '@/lib/audit/helpers';
import { AuditDetailDialog } from './audit-detail-dialog';

// Memoized row component to prevent unnecessary re-renders
const AuditLogRow = memo(function AuditLogRow({
  log,
  onViewDetails,
}: {
  log: AuditLogWithActor;
  onViewDetails: (log: AuditLogWithActor) => void;
}) {
  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/50"
      onClick={() => onViewDetails(log)}
    >
      <TableCell className="whitespace-nowrap">
        <div className="text-sm">
          {format(new Date(log.created_at), 'MMM d, yyyy')}
        </div>
        <div className="text-xs text-muted-foreground">
          {format(new Date(log.created_at), 'h:mm a')}
        </div>
      </TableCell>
      <TableCell>
        <div className="text-sm">{log.actor?.full_name || 'Unknown'}</div>
        <div className="text-xs text-muted-foreground">
          {log.actor?.role?.replace('_', ' ')}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={getActionBadgeVariant(log.action)}>
          {AUDIT_ACTION_LABELS[log.action]}
        </Badge>
      </TableCell>
      <TableCell>
        {log.entity_id && (log.entity_type === 'residents' || log.entity_type === 'houses' || log.entity_type === 'payments' || log.entity_type === 'invoices') ? (
          <Link
            href={`/${log.entity_type}/${log.entity_id}`}
            className="text-sm hover:underline text-primary"
            onClick={(e) => e.stopPropagation()}
          >
            {log.entity_display || 'N/A'}
          </Link>
        ) : (
          <div className="text-sm">{log.entity_display || 'N/A'}</div>
        )}
        <div className="text-xs text-muted-foreground">
          {AUDIT_ENTITY_LABELS[log.entity_type]}
        </div>
      </TableCell>
      <TableCell>
        <div className="text-sm text-muted-foreground max-w-[200px] truncate">
          {log.description || '—'}
        </div>
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails(log);
          }}
        >
          <Eye className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
});

interface AuditLogsTableProps {
  logs: AuditLogWithActor[] | null;
  total: number;
  isLoading: boolean;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  onClearFilters?: () => void;
  hasFilters?: boolean;
}

export function AuditLogsTable({
  logs,
  total,
  isLoading,
  page,
  limit,
  onPageChange,
  onClearFilters,
  hasFilters = false,
}: AuditLogsTableProps) {
  const [selectedLog, setSelectedLog] = useState<AuditLogWithActor | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const totalPages = Math.ceil(total / limit);
  const startIndex = (page - 1) * limit + 1;
  const endIndex = Math.min(page * limit, total);

  // Memoized handler to prevent row re-renders
  const handleViewDetails = useCallback((log: AuditLogWithActor) => {
    setSelectedLog(log);
    setDetailOpen(true);
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">No audit logs found</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">
          {hasFilters
            ? 'Try adjusting your filters or date range to see more results'
            : 'Audit logs will appear here as actions are performed in the system'}
        </p>
        {hasFilters && onClearFilters && (
          <Button variant="outline" size="sm" onClick={onClearFilters} className="mt-4">
            Clear Filters
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <AuditLogRow
                key={log.id}
                log={log}
                onViewDetails={handleViewDetails}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between py-4">
        <div className="text-sm text-muted-foreground">
          Showing {startIndex} to {endIndex} of {total} entries
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <div className="text-sm">
            Page {page} of {totalPages || 1}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Detail Dialog */}
      <AuditDetailDialog
        log={selectedLog}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </>
  );
}
