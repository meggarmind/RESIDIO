'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow, format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
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
  useInAppNotifications,
  useMarkNotificationAsRead,
  useMarkAllNotificationsAsRead,
  useDeleteNotification,
  useDeleteReadNotifications,
} from '@/hooks/use-in-app-notifications';
import {
  Bell,
  BellRing,
  Check,
  CheckCheck,
  Trash2,
  Megaphone,
  CreditCard,
  Shield,
  AlertTriangle,
  Info,
  Settings,
  FileText,
  Users,
  Home,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { InAppNotification } from '@/types/database';

// Map notification categories to icons
const categoryIcons: Record<string, React.ElementType> = {
  announcement: Megaphone,
  payment: CreditCard,
  security: Shield,
  alert: AlertTriangle,
  info: Info,
  settings: Settings,
  document: FileText,
  resident: Users,
  house: Home,
  event: Calendar,
  default: Bell,
};

// Map category to label
const categoryLabels: Record<string, string> = {
  announcement: 'Announcement',
  payment: 'Payment',
  security: 'Security',
  alert: 'Alert',
  info: 'Information',
  settings: 'Settings',
  document: 'Document',
  resident: 'Resident',
  house: 'House',
  event: 'Event',
};

interface NotificationCardProps {
  notification: InAppNotification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
  isMarkingRead: boolean;
  isDeleting: boolean;
}

function NotificationCard({
  notification,
  onMarkAsRead,
  onDelete,
  isMarkingRead,
  isDeleting,
}: NotificationCardProps) {
  const Icon = categoryIcons[notification.category] || categoryIcons.default;
  const isUnread = !notification.is_read;
  const timeAgo = formatDistanceToNow(new Date(notification.created_at), { addSuffix: true });
  const fullDate = format(new Date(notification.created_at), 'PPpp');

  return (
    <Card className={cn('transition-all', isUnread && 'border-primary/50 bg-accent/30')}>
      <CardContent className="p-4">
        <div className="flex gap-4">
          <div
            className={cn(
              'flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center',
              notification.priority === 'urgent'
                ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400'
                : notification.priority === 'high'
                  ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/50 dark:text-orange-400'
                  : 'bg-muted text-muted-foreground'
            )}
          >
            <Icon className="h-6 w-6" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className={cn('font-medium', isUnread && 'font-semibold')}>
                  {notification.title}
                </h3>
                {isUnread && (
                  <Badge variant="default" className="text-xs">
                    New
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs capitalize">
                  {categoryLabels[notification.category] || notification.category}
                </Badge>
                {notification.priority === 'urgent' && (
                  <Badge variant="destructive" className="text-xs">
                    Urgent
                  </Badge>
                )}
                {notification.priority === 'high' && (
                  <Badge className="text-xs bg-orange-500 hover:bg-orange-600">High Priority</Badge>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {isUnread && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onMarkAsRead(notification.id)}
                    disabled={isMarkingRead}
                    title="Mark as read"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(notification.id)}
                  disabled={isDeleting}
                  className="text-destructive hover:text-destructive"
                  title="Delete notification"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-2">{notification.body}</p>

            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-muted-foreground" title={fullDate}>
                {timeAgo}
              </p>
              {notification.action_url && (
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
                  <Link href={notification.action_url}>
                    View details
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [clearReadConfirm, setClearReadConfirm] = useState(false);

  const {
    data: notificationsData,
    isLoading,
  } = useInAppNotifications({
    unread_only: activeTab === 'unread',
    limit: 50,
  });

  const markAsReadMutation = useMarkNotificationAsRead();
  const markAllAsReadMutation = useMarkAllNotificationsAsRead();
  const deleteMutation = useDeleteNotification();
  const deleteReadMutation = useDeleteReadNotifications();

  const notifications = notificationsData?.data || [];
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleMarkAsRead = (id: string) => {
    markAsReadMutation.mutate(id, {
      onSuccess: () => {
        toast.success('Notification marked as read');
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });
  };

  const handleMarkAllAsRead = () => {
    markAllAsReadMutation.mutate(undefined, {
      onSuccess: (count) => {
        toast.success(`${count} notifications marked as read`);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });
  };

  const handleDelete = () => {
    if (!deleteConfirm) return;
    deleteMutation.mutate(deleteConfirm, {
      onSuccess: () => {
        toast.success('Notification deleted');
        setDeleteConfirm(null);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });
  };

  const handleClearRead = () => {
    deleteReadMutation.mutate(undefined, {
      onSuccess: (count) => {
        toast.success(`${count} read notifications cleared`);
        setClearReadConfirm(false);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bell className="h-8 w-8" />
            Notifications
          </h1>
          <p className="text-muted-foreground">
            Stay updated with announcements, alerts, and important updates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              onClick={handleMarkAllAsRead}
              disabled={markAllAsReadMutation.isPending}
            >
              <CheckCheck className="h-4 w-4 mr-2" />
              Mark all as read
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setClearReadConfirm(true)}
            disabled={deleteReadMutation.isPending}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear read
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'all' | 'unread')}>
        <TabsList>
          <TabsTrigger value="all" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            All
          </TabsTrigger>
          <TabsTrigger value="unread" className="flex items-center gap-2">
            <BellRing className="h-4 w-4" />
            Unread
            {unreadCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-1/3" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Bell className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="font-medium text-lg mb-1">
                  {activeTab === 'unread' ? 'No unread notifications' : 'No notifications'}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {activeTab === 'unread'
                    ? "You're all caught up! Check back later for new updates."
                    : "You don't have any notifications yet."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={handleMarkAsRead}
                  onDelete={(id) => setDeleteConfirm(id)}
                  isMarkingRead={markAsReadMutation.isPending}
                  isDeleting={deleteMutation.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Notification</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this notification? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Read Confirmation */}
      <AlertDialog open={clearReadConfirm} onOpenChange={setClearReadConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Read Notifications</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete all read notifications? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearRead}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear All Read
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
