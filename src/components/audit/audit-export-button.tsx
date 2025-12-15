'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { getAuditLogs, type GetAuditLogsParams } from '@/actions/audit';
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS } from '@/types/database';

interface AuditExportButtonProps {
  filters: GetAuditLogsParams;
}

export function AuditExportButton({ filters }: AuditExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const convertToCSV = (data: any[]) => {
    if (!data || data.length === 0) return '';

    // CSV Headers
    const headers = [
      'Timestamp',
      'Date',
      'Time',
      'Actor Name',
      'Actor Email',
      'Actor Role',
      'Action',
      'Entity Type',
      'Entity',
      'Description',
    ];

    // CSV Rows
    const rows = data.map((log) => {
      const timestamp = new Date(log.created_at);
      return [
        log.created_at,
        format(timestamp, 'MMM d, yyyy'),
        format(timestamp, 'h:mm a'),
        log.actor?.full_name || 'Unknown',
        log.actor?.email || 'N/A',
        log.actor?.role?.replace('_', ' ') || 'N/A',
        AUDIT_ACTION_LABELS[log.action as keyof typeof AUDIT_ACTION_LABELS] || log.action,
        AUDIT_ENTITY_LABELS[log.entity_type as keyof typeof AUDIT_ENTITY_LABELS] || log.entity_type,
        log.entity_display || 'N/A',
        log.description || '',
      ];
    });

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    return csvContent;
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Fetch all logs with current filters (no pagination, max 10000 records)
      const result = await getAuditLogs({ ...filters, limit: 10000, page: 1 });

      if (result.error) {
        throw new Error(result.error);
      }

      if (!result.data || result.data.length === 0) {
        toast.error('No audit logs to export');
        return;
      }

      // Convert to CSV
      const csv = convertToCSV(result.data);

      // Create download link
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${result.data.length} audit log entries`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export audit logs');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={isExporting}
    >
      <Download className="h-4 w-4 mr-2" />
      {isExporting ? 'Exporting...' : 'Export CSV'}
    </Button>
  );
}
