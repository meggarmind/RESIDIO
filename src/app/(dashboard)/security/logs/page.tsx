'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  ClipboardList,
  Loader2,
  UserCheck,
  UserX,
  AlertTriangle,
  Flag,
  Download,
  Search,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import {
  useAccessLogs,
  useCurrentUserSecurityPermissions,
  useRecordCheckOut,
  useFlagAccess,
  useExportAccessLogsCSV,
} from '@/hooks/use-security';
import { FlaggedBadge } from '@/components/security/security-badges';
import { toast } from 'sonner';
import type { AccessLogsFilters } from '@/lib/validators/security-contact';
import type { AccessLog } from '@/types/database';

const ALL_VALUE = '_all';

export default function AccessLogsPage() {
  const [filters, setFilters] = useState<AccessLogsFilters>({
    page: 1,
    limit: 20,
  });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(ALL_VALUE);
  const [searchQuery, setSearchQuery] = useState('');

  const [showFlagDialog, setShowFlagDialog] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [flagReason, setFlagReason] = useState('');

  const { data: permissionsData, isLoading: permissionsLoading } = useCurrentUserSecurityPermissions();
  const { data: logsData, isLoading: logsLoading, refetch } = useAccessLogs({
    ...filters,
    date_from: dateFrom ? new Date(dateFrom).toISOString() : undefined,
    date_to: dateTo ? new Date(dateTo + 'T23:59:59').toISOString() : undefined,
    flagged_only: flaggedOnly === 'true',
  });

  const checkOutMutation = useRecordCheckOut();
  const flagMutation = useFlagAccess();
  const exportMutation = useExportAccessLogsCSV();

  const canViewLogs = permissionsData?.permissions?.view_access_logs || false;
  const canRecordCheckIn = permissionsData?.permissions?.record_checkin || false;

  const handleExport = async () => {
    try {
      const csvData = await exportMutation.mutateAsync({
        date_from: dateFrom || undefined,
        date_to: dateTo ? dateTo + 'T23:59:59' : undefined,
        flagged_only: flaggedOnly === 'true',
      });
      if (csvData) {
        // Create blob and trigger download
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `access-logs-${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success('Access logs exported successfully');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to export logs');
    }
  };

  const logs = logsData?.data || [];
  const totalCount = logsData?.count || 0;
  const totalPages = Math.ceil(totalCount / (filters.limit || 20));

  const handleCheckOut = async (logId: string) => {
    try {
      await checkOutMutation.mutateAsync({ log_id: logId });
      toast.success('Check-out recorded successfully');
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to record check-out');
    }
  };

  const handleFlag = async () => {
    if (!selectedLogId || !flagReason.trim()) return;

    try {
      await flagMutation.mutateAsync({
        log_id: selectedLogId,
        flag_reason: flagReason,
      });
      toast.success('Access flagged successfully');
      setShowFlagDialog(false);
      setSelectedLogId(null);
      setFlagReason('');
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to flag access');
    }
  };

  const openFlagDialog = (logId: string) => {
    setSelectedLogId(logId);
    setFlagReason('');
    setShowFlagDialog(true);
  };

  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!canViewLogs) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ClipboardList className="h-8 w-8" />
            Access Logs
          </h1>
          <p className="text-muted-foreground">
            View check-in and check-out records
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Permission Denied</CardTitle>
            <CardDescription>
              You do not have permission to view access logs.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ClipboardList className="h-8 w-8" />
            Access Logs
          </h1>
          <p className="text-muted-foreground">
            View check-in and check-out records ({totalCount} total)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={exportMutation.isPending}
          >
            {exportMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Export
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="dateFrom">From Date</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateTo">To Date</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={flaggedOnly} onValueChange={setFlaggedOnly}>
                <SelectTrigger>
                  <SelectValue placeholder="All logs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>All Logs</SelectItem>
                  <SelectItem value="true">Flagged Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  setFlaggedOnly(ALL_VALUE);
                  setFilters({ page: 1, limit: 20 });
                }}
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs List */}
      <Card>
        <CardContent className="pt-6">
          {logsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : logs.length > 0 ? (
            <div className="space-y-4">
              {logs.map((log: AccessLog & { contact?: any; resident?: any }) => (
                <div
                  key={log.id}
                  className={`flex items-start justify-between p-4 border rounded-lg ${
                    log.flagged ? 'border-destructive bg-destructive/5' : ''
                  }`}
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {log.contact?.full_name || 'Unknown Contact'}
                      </span>
                      {log.flagged && <FlaggedBadge flagged={log.flagged} reason={log.flag_reason} />}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Visiting: {log.resident?.first_name || ''} {log.resident?.last_name || ''}
                      {log.resident?.resident_code && (
                        <span className="ml-2 text-xs">({log.resident.resident_code})</span>
                      )}
                    </div>
                    {log.gate_location && (
                      <div className="text-xs text-muted-foreground">
                        Gate: {log.gate_location}
                      </div>
                    )}
                    {log.notes && (
                      <div className="text-xs text-muted-foreground">
                        Notes: {log.notes}
                      </div>
                    )}
                    {log.flagged && log.flag_reason && (
                      <div className="text-xs text-destructive mt-2">
                        <AlertTriangle className="h-3 w-3 inline mr-1" />
                        Flag reason: {log.flag_reason}
                      </div>
                    )}
                  </div>
                  <div className="text-right space-y-2">
                    <div className="space-y-1">
                      <div className="flex items-center justify-end gap-2 text-sm">
                        <UserCheck className="h-4 w-4 text-green-600" />
                        <span>{new Date(log.check_in_time).toLocaleString()}</span>
                      </div>
                      {log.check_out_time ? (
                        <div className="flex items-center justify-end gap-2 text-sm">
                          <UserX className="h-4 w-4 text-muted-foreground" />
                          <span>{new Date(log.check_out_time).toLocaleString()}</span>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Still inside
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      {!log.check_out_time && canRecordCheckIn && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCheckOut(log.id)}
                          disabled={checkOutMutation.isPending}
                        >
                          {checkOutMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <UserX className="h-4 w-4 mr-1" />
                              Check Out
                            </>
                          )}
                        </Button>
                      )}
                      {!log.flagged && canRecordCheckIn && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openFlagDialog(log.id)}
                        >
                          <Flag className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {filters.page} of {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setFilters((prev) => ({ ...prev, page: (prev.page || 1) - 1 }))
                      }
                      disabled={(filters.page || 1) <= 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setFilters((prev) => ({ ...prev, page: (prev.page || 1) + 1 }))
                      }
                      disabled={(filters.page || 1) >= totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No access logs found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {dateFrom || dateTo
                  ? 'Try adjusting your date filters'
                  : 'Access logs will appear here when visitors are checked in'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Flag Dialog */}
      <Dialog open={showFlagDialog} onOpenChange={setShowFlagDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5 text-destructive" />
              Flag Access Entry
            </DialogTitle>
            <DialogDescription>
              Flag this access entry for suspicious activity. This will be visible to administrators.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="flagReason">Reason for Flagging</Label>
              <Textarea
                id="flagReason"
                placeholder="Describe the suspicious activity..."
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFlagDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleFlag}
              disabled={!flagReason.trim() || flagMutation.isPending}
            >
              {flagMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Flag Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
