'use client';

/**
 * Notification History Component
 *
 * Displays a filterable table of notification history with details.
 */

import { useState } from 'react';
import { format, subDays } from 'date-fns';
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
import { Input } from '@/components/ui/input';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Mail,
  MessageSquare,
  Phone,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  MousePointerClick,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useNotificationHistory } from '@/hooks/use-notifications';
import {
  NOTIFICATION_CHANNEL_LABELS,
  HISTORY_STATUS_LABELS,
  type NotificationChannel,
  type HistoryStatus,
  type HistoryEntryWithDetails,
} from '@/lib/notifications/types';

const ALL_VALUE = '_all';
const PAGE_SIZE = 20;

function getChannelIcon(channel: NotificationChannel) {
  switch (channel) {
    case 'email':
      return <Mail className="h-4 w-4" />;
    case 'sms':
      return <MessageSquare className="h-4 w-4" />;
    case 'whatsapp':
      return <Phone className="h-4 w-4" />;
  }
}

function getStatusIcon(status: HistoryStatus) {
  switch (status) {
    case 'sent':
      return <Clock className="h-4 w-4 text-blue-500" />;
    case 'delivered':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'opened':
      return <Eye className="h-4 w-4 text-purple-500" />;
    case 'clicked':
      return <MousePointerClick className="h-4 w-4 text-indigo-500" />;
    case 'bounced':
      return <XCircle className="h-4 w-4 text-orange-500" />;
  }
}

function getStatusColor(status: HistoryStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'delivered':
    case 'opened':
    case 'clicked':
      return 'default';
    case 'sent':
      return 'secondary';
    case 'failed':
    case 'bounced':
      return 'destructive';
    default:
      return 'outline';
  }
}

interface NotificationHistoryProps {
  recipientId?: string;
  showFilters?: boolean;
}

export function NotificationHistory({ recipientId, showFilters = true }: NotificationHistoryProps) {
  const [page, setPage] = useState(0);
  const [channelFilter, setChannelFilter] = useState<string>(ALL_VALUE);
  const [statusFilter, setStatusFilter] = useState<string>(ALL_VALUE);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntryWithDetails | null>(null);

  // Default to last 30 days
  const fromDate = subDays(new Date(), 30);

  const { data, isLoading } = useNotificationHistory({
    recipientId,
    channel: channelFilter === ALL_VALUE ? undefined : (channelFilter as NotificationChannel),
    status: statusFilter === ALL_VALUE ? undefined : (statusFilter as HistoryStatus),
    fromDate,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const history = data?.data || [];
  const total = data?.count || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Client-side search filtering
  const filteredHistory = searchTerm
    ? history.filter(
        (entry) =>
          entry.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          entry.recipient_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          entry.body_preview?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : history;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {showFilters && (
          <div className="flex gap-4">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-10 flex-1" />
          </div>
        )}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showFilters && (
        <div className="flex flex-wrap gap-4">
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Channels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>All Channels</SelectItem>
              {Object.entries(NOTIFICATION_CHANNEL_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>All Statuses</SelectItem>
              {Object.entries(HISTORY_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search subject or recipient..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[100px]">Channel</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead className="w-[150px]">Sent</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredHistory.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No notification history found
                </TableCell>
              </TableRow>
            ) : (
              filteredHistory.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <Badge variant={getStatusColor(entry.status)} className="flex items-center gap-1.5 w-fit">
                      {getStatusIcon(entry.status)}
                      {HISTORY_STATUS_LABELS[entry.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {getChannelIcon(entry.channel)}
                      <span className="text-sm">{NOTIFICATION_CHANNEL_LABELS[entry.channel]}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="truncate max-w-[200px]">
                      {entry.recipient_email || entry.recipient_phone || 'Unknown'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="truncate max-w-[250px]">
                      {entry.subject || <span className="text-muted-foreground italic">No subject</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    {entry.sent_at ? (
                      <div className="text-sm">
                        {format(new Date(entry.sent_at), 'MMM d, yyyy')}
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(entry.sent_at), 'h:mm a')}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedEntry(entry as HistoryEntryWithDetails)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
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
          <div className="text-sm text-muted-foreground">
            Showing {page * PAGE_SIZE + 1} to {Math.min((page + 1) * PAGE_SIZE, total)} of {total} entries
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Notification Details</DialogTitle>
            <DialogDescription>
              {selectedEntry?.subject || 'Notification details'}
            </DialogDescription>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Status</div>
                  <Badge variant={getStatusColor(selectedEntry.status)} className="flex items-center gap-1.5 w-fit mt-1">
                    {getStatusIcon(selectedEntry.status)}
                    {HISTORY_STATUS_LABELS[selectedEntry.status]}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Channel</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {getChannelIcon(selectedEntry.channel)}
                    {NOTIFICATION_CHANNEL_LABELS[selectedEntry.channel]}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Recipient</div>
                  <div className="mt-1">{selectedEntry.recipient_email || selectedEntry.recipient_phone}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">External ID</div>
                  <div className="mt-1 text-xs font-mono">
                    {selectedEntry.external_id || <span className="text-muted-foreground">—</span>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="font-medium text-muted-foreground">Sent</div>
                  <div>{selectedEntry.sent_at ? format(new Date(selectedEntry.sent_at), 'PPp') : '—'}</div>
                </div>
                <div>
                  <div className="font-medium text-muted-foreground">Delivered</div>
                  <div>{selectedEntry.delivered_at ? format(new Date(selectedEntry.delivered_at), 'PPp') : '—'}</div>
                </div>
                <div>
                  <div className="font-medium text-muted-foreground">Opened</div>
                  <div>{selectedEntry.opened_at ? format(new Date(selectedEntry.opened_at), 'PPp') : '—'}</div>
                </div>
                <div>
                  <div className="font-medium text-muted-foreground">Clicked</div>
                  <div>{selectedEntry.clicked_at ? format(new Date(selectedEntry.clicked_at), 'PPp') : '—'}</div>
                </div>
              </div>

              {selectedEntry.error_message && (
                <div className="p-3 bg-destructive/10 rounded-md">
                  <div className="text-sm font-medium text-destructive">Error</div>
                  <div className="text-sm mt-1">{selectedEntry.error_message}</div>
                </div>
              )}

              <div>
                <div className="text-sm font-medium text-muted-foreground mb-2">Body Preview</div>
                <div className="p-3 bg-muted rounded-md text-sm whitespace-pre-wrap">
                  {selectedEntry.body_preview || <span className="text-muted-foreground italic">No preview available</span>}
                </div>
              </div>

              {selectedEntry.metadata && Object.keys(selectedEntry.metadata).length > 0 && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-2">Metadata</div>
                  <pre className="p-3 bg-muted rounded-md text-xs overflow-auto max-h-40">
                    {JSON.stringify(selectedEntry.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
