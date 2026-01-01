'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useInAppNotifications,
  useUnreadNotificationCount,
  useMarkNotificationAsRead,
  useMarkAllNotificationsAsRead,
} from '@/hooks/use-in-app-notifications';
import {
  Bell,
  BellRing,
  CheckCheck,
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
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

interface NotificationItemProps {
  notification: InAppNotification;
  onMarkAsRead: (id: string) => void;
  isMarkingRead: boolean;
}

function NotificationItem({ notification, onMarkAsRead, isMarkingRead }: NotificationItemProps) {
  const Icon = categoryIcons[notification.category] || categoryIcons.default;
  const isUnread = !notification.is_read;
  const timeAgo = formatDistanceToNow(new Date(notification.created_at), { addSuffix: true });

  const content = (
    <div
      className={cn(
        'flex gap-3 p-3 rounded-lg transition-colors cursor-pointer',
        isUnread ? 'bg-accent/50 hover:bg-accent' : 'hover:bg-muted/50'
      )}
      onClick={() => {
        if (isUnread && !isMarkingRead) {
          onMarkAsRead(notification.id);
        }
      }}
    >
      <div
        className={cn(
          'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
          notification.priority === 'urgent'
            ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400'
            : notification.priority === 'high'
              ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/50 dark:text-orange-400'
              : 'bg-muted text-muted-foreground'
        )}
      >
        <Icon className="h-5 w-5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm font-medium truncate', isUnread && 'font-semibold')}>
            {notification.title}
          </p>
          {isUnread && <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />}
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2">{notification.body}</p>
        <p className="text-xs text-muted-foreground mt-1">{timeAgo}</p>
      </div>
    </div>
  );

  if (notification.action_url) {
    return (
      <Link href={notification.action_url} className="block">
        {content}
      </Link>
    );
  }

  return content;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);

  const { data: unreadCount = 0, isLoading: isLoadingCount } = useUnreadNotificationCount();
  const { data: notificationsData, isLoading: isLoadingNotifications } = useInAppNotifications({
    limit: 10,
  });
  const markAsReadMutation = useMarkNotificationAsRead();
  const markAllAsReadMutation = useMarkAllNotificationsAsRead();

  const notifications = notificationsData?.data || [];
  const hasUnread = unreadCount > 0;

  const handleMarkAsRead = (id: string) => {
    markAsReadMutation.mutate(id);
  };

  const handleMarkAllAsRead = () => {
    markAllAsReadMutation.mutate();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          {hasUnread ? (
            <BellRing className="h-5 w-5" />
          ) : (
            <Bell className="h-5 w-5" />
          )}
          {!isLoadingCount && hasUnread && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-[1.25rem] px-1 text-xs flex items-center justify-center"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
          <span className="sr-only">
            {hasUnread ? `${unreadCount} unread notifications` : 'Notifications'}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Notifications</h3>
            {hasUnread && (
              <Badge variant="secondary" className="text-xs">
                {unreadCount} new
              </Badge>
            )}
          </div>
          {hasUnread && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllAsRead}
              disabled={markAllAsReadMutation.isPending}
              className="text-xs h-8"
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="h-[340px]">
          {isLoadingNotifications ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Bell className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm font-medium">No notifications</p>
              <p className="text-xs mt-1">You&apos;re all caught up!</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={handleMarkAsRead}
                  isMarkingRead={markAsReadMutation.isPending}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        <Separator />
        <div className="p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-sm"
            asChild
            onClick={() => setOpen(false)}
          >
            <Link href="/notifications">View all notifications</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
