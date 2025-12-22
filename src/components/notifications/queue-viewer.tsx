'use client';

/**
 * Notification Queue Viewer Component
 *
 * Displays and manages pending notifications in the queue.
 */

import { useState } from 'react';
import { format } from 'date-fns';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  Clock,
  Play,
  XCircle,
  RotateCcw,
  Eye,
  AlertTriangle,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useNotificationQueue,
  useCancelNotification,
  useRetryNotification,
} from '@/hooks/use-notifications';
import {
  NOTIFICATION_CHANNEL_LABELS,
  QUEUE_STATUS_LABELS,
  PRIORITY_LABELS,
  type NotificationChannel,
  type QueueStatus,
  type QueueItemWithDetails,
} from '@/lib/notifications/types';

const ALL_VALUE = '_all';

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

function getStatusIcon(status: QueueStatus) {
  switch (status) {
    case 'pending':
      return <Clock className="h-4 w-4 text-yellow-500" />;
    case 'processing':
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case 'sent':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'cancelled':
      return <XCircle className="h-4 w-4 text-gray-500" />;
  }
}

function getStatusColor(status: QueueStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'sent':
      return 'default';
    case 'pending':
    case 'processing':
      return 'secondary';
    case 'failed':
      return 'destructive';
    case 'cancelled':
      return 'outline';
    default:
      return 'outline';
  }
}

function getPriorityColor(priority: number): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (priority <= 2) return 'destructive'; // Urgent
  if (priority <= 4) return 'default'; // High
  if (priority <= 6) return 'secondary'; // Normal
  return 'outline'; // Low/Bulk
}

function getPriorityLabel(priority: number): string {
  if (priority <= 1) return 'Urgent';
  if (priority <= 3) return 'High';
  if (priority <= 5) return 'Normal';
  if (priority <= 7) return 'Low';
  return 'Bulk';
}

export function QueueViewer() {
  const [statusFilter, setStatusFilter] = useState<string>(ALL_VALUE);
  const [channelFilter, setChannelFilter] = useState<string>(ALL_VALUE);
  const [selectedItem, setSelectedItem] = useState<QueueItemWithDetails | null>(null);
  const [cancelItemId, setCancelItemId] = useState<string | null>(null);

  const { data: queueItems, isLoading } = useNotificationQueue({
    status: statusFilter === ALL_VALUE ? undefined : (statusFilter as QueueStatus),
    channel: channelFilter === ALL_VALUE ? undefined : (channelFilter as NotificationChannel),
    limit: 100,
  });

  const cancelMutation = useCancelNotification();
  const retryMutation = useRetryNotification();

  const handleCancel = async (id: string) => {
    try {
      await cancelMutation.mutateAsync({ id });
      setCancelItemId(null);
    } catch {
      // Error toast handled by mutation
    }
  };

  const handleRetry = async (id: string) => {
    try {
      await retryMutation.mutateAsync(id);
    } catch {
      // Error toast handled by mutation
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-4">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  const items = queueItems || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All Statuses</SelectItem>
            {Object.entries(QUEUE_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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

        <div className="ml-auto text-sm text-muted-foreground">
          {items.length} item{items.length !== 1 ? 's' : ''} in queue
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[100px]">Priority</TableHead>
              <TableHead className="w-[100px]">Channel</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead className="w-[150px]">Scheduled</TableHead>
              <TableHead className="w-[120px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No items in queue
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Badge variant={getStatusColor(item.status)} className="flex items-center gap-1.5 w-fit">
                      {getStatusIcon(item.status)}
                      {QUEUE_STATUS_LABELS[item.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getPriorityColor(item.priority)}>
                      {getPriorityLabel(item.priority)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {getChannelIcon(item.channel)}
                      <span className="text-sm">{NOTIFICATION_CHANNEL_LABELS[item.channel]}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="truncate max-w-[200px]">
                      {item.recipient_email || item.recipient_phone || 'Unknown'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="truncate max-w-[200px]">
                      {item.subject || <span className="text-muted-foreground italic">No subject</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    {item.scheduled_for ? (
                      <div className="text-sm">
                        {format(new Date(item.scheduled_for), 'MMM d, yyyy')}
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(item.scheduled_for), 'h:mm a')}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Immediate</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setSelectedItem(item as QueueItemWithDetails)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {(item.status === 'pending' || item.status === 'processing') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setCancelItemId(item.id)}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                      {item.status === 'failed' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleRetry(item.id)}
                          disabled={retryMutation.isPending}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Queue Item Details</DialogTitle>
            <DialogDescription>
              {selectedItem?.subject || 'Notification details'}
            </DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Status</div>
                  <Badge variant={getStatusColor(selectedItem.status)} className="flex items-center gap-1.5 w-fit mt-1">
                    {getStatusIcon(selectedItem.status)}
                    {QUEUE_STATUS_LABELS[selectedItem.status]}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Priority</div>
                  <Badge variant={getPriorityColor(selectedItem.priority)} className="mt-1">
                    {getPriorityLabel(selectedItem.priority)}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Channel</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {getChannelIcon(selectedItem.channel)}
                    {NOTIFICATION_CHANNEL_LABELS[selectedItem.channel]}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Recipient</div>
                  <div className="mt-1">{selectedItem.recipient_email || selectedItem.recipient_phone}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Scheduled For</div>
                  <div className="mt-1">
                    {selectedItem.scheduled_for
                      ? format(new Date(selectedItem.scheduled_for), 'PPp')
                      : 'Immediate'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="font-medium text-muted-foreground">Attempts</div>
                  <div>{selectedItem.attempts} / {selectedItem.max_attempts}</div>
                </div>
                <div>
                  <div className="font-medium text-muted-foreground">Last Attempt</div>
                  <div>
                    {selectedItem.last_attempt_at
                      ? format(new Date(selectedItem.last_attempt_at), 'PPp')
                      : '—'}
                  </div>
                </div>
                <div>
                  <div className="font-medium text-muted-foreground">Created</div>
                  <div>{format(new Date(selectedItem.created_at), 'PPp')}</div>
                </div>
              </div>

              {selectedItem.error_message && (
                <div className="p-3 bg-destructive/10 rounded-md">
                  <div className="text-sm font-medium text-destructive flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Error
                  </div>
                  <div className="text-sm mt-1">{selectedItem.error_message}</div>
                </div>
              )}

              <div>
                <div className="text-sm font-medium text-muted-foreground mb-2">Body</div>
                <div className="p-3 bg-muted rounded-md text-sm whitespace-pre-wrap max-h-40 overflow-auto">
                  {selectedItem.body}
                </div>
              </div>

              {selectedItem.html_body && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-2">HTML Body</div>
                  <pre className="p-3 bg-muted rounded-md text-xs overflow-auto max-h-40">
                    {selectedItem.html_body}
                  </pre>
                </div>
              )}

              {selectedItem.variables && Object.keys(selectedItem.variables).length > 0 && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-2">Variables</div>
                  <pre className="p-3 bg-muted rounded-md text-xs overflow-auto max-h-32">
                    {JSON.stringify(selectedItem.variables, null, 2)}
                  </pre>
                </div>
              )}

              {selectedItem.deduplication_key && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Deduplication Key</div>
                  <div className="mt-1 text-xs font-mono bg-muted p-2 rounded">
                    {selectedItem.deduplication_key}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={!!cancelItemId} onOpenChange={() => setCancelItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Notification?</AlertDialogTitle>
            <AlertDialogDescription>
              This will prevent the notification from being sent. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Scheduled</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelItemId && handleCancel(cancelItemId)}
              disabled={cancelMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Notification'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
