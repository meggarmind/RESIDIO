'use client';

import { useEffect, useState } from 'react';
import {
  getQueuedNotifications,
  getQueueStats,
  deleteQueuedNotification,
  clearQueue,
} from '@/actions/notifications/queue-management';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Trash2, RefreshCw, Mail, MessageSquare, Phone, Bell, Info } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const channelIcons = {
  email: <Mail className="h-4 w-4" />,
  sms: <MessageSquare className="h-4 w-4" />,
  whatsapp: <Phone className="h-4 w-4" />,
};

export default function NotificationQueuePage() {
  const [stats, setStats] = useState<any>(null);
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ channel: '', category: '' });
  const [deleting, setDeleting] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [statsResult, queueResult] = await Promise.all([
      getQueueStats(),
      getQueuedNotifications({ ...filters, limit: 50 }),
    ]);

    if (statsResult.data) setStats(statsResult.data);
    if (queueResult.data) setQueue(queueResult.data);
    if (statsResult.error) toast.error(statsResult.error);
    if (queueResult.error) toast.error(queueResult.error);

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [filters]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    const result = await deleteQueuedNotification(id);

    if (result.success) {
      toast.success('Notification removed from queue');
      fetchData();
    } else {
      toast.error(result.error || 'Failed to delete');
    }
    setDeleting(null);
  };

  const handleClearQueue = async () => {
    setClearing(true);
    const result = await clearQueue(
      filters.channel || filters.category
        ? { channel: filters.channel || undefined, category: filters.category || undefined }
        : undefined
    );

    if (result.success) {
      toast.success(`Cleared ${result.deletedCount} notification(s)`);
      fetchData();
    } else {
      toast.error(result.error || 'Failed to clear queue');
    }
    setClearing(false);
  };

  const totalPending = Object.values(stats?.byChannel || {}).reduce(
    (sum: number, count) => sum + (count as number),
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Queue
        </h3>
        <p className="text-sm text-muted-foreground">
          View and manage notifications waiting to be sent
        </p>
      </div>

      <Separator />

      {/* Info Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Notifications in the queue are processed by a cron job that runs every 5 minutes. You can
          manually delete or clear notifications if needed.
        </AlertDescription>
      </Alert>

      {/* Stats Cards */}
      {!loading && stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Total Pending */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Pending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalPending}</div>
            </CardContent>
          </Card>

          {/* Email */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byChannel.email || 0}</div>
            </CardContent>
          </Card>

          {/* SMS */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                SMS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byChannel.sms || 0}</div>
            </CardContent>
          </Card>

          {/* Recent Failures */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Recent Failures (24h)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.recentFailures}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters and Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Queue Items</CardTitle>
            <div className="flex items-center gap-2">
              <Select
                value={filters.channel}
                onValueChange={(value) => setFilters({ ...filters, channel: value })}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Channels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Channels</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filters.category}
                onValueChange={(value) => setFilters({ ...filters, category: value })}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Categories</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="announcements">Announcements</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>

              {totalPending > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={clearing}>
                      {clearing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Clear Queue
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear Notification Queue?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will delete{' '}
                        {filters.channel || filters.category ? 'filtered' : 'all'} notifications
                        from the queue. This action cannot be undone.
                        {filters.channel && (
                          <span className="block mt-2 font-medium">
                            Channel filter: {filters.channel}
                          </span>
                        )}
                        {filters.category && (
                          <span className="block mt-2 font-medium">
                            Category filter: {filters.category}
                          </span>
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleClearQueue} className="bg-destructive">
                        Clear Queue
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : queue.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No notifications in queue</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue.map((notification: any) => (
                    <TableRow key={notification.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {notification.profiles?.first_name} {notification.profiles?.last_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {notification.recipient_email || notification.recipient_phone}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="flex items-center gap-1 w-fit">
                          {channelIcons[notification.channel as keyof typeof channelIcons]}
                          {notification.channel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{notification.category}</Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{notification.subject}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(notification.scheduled_at), {
                          addSuffix: true,
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(notification.id)}
                          disabled={deleting === notification.id}
                        >
                          {deleting === notification.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
