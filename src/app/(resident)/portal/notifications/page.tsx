'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { useRouter } from 'next/navigation';
import {
  useInAppNotifications,
  useUnreadNotificationCount,
  useMarkNotificationAsRead,
  useMarkAllNotificationsAsRead,
} from '@/hooks/use-in-app-notifications';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Bell,
  Megaphone,
  CreditCard,
  Shield,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import type { InAppNotification } from '@/types/database';

const categoryIcons = {
  announcement: Megaphone,
  payment: CreditCard,
  security: Shield,
  system: Bell,
};

const spring = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
};

export default function NotificationsPage() {
  const { user, loading: authLoading, resident } = useAuth();
  const router = useRouter();

  const [filters, setFilters] = useState({
    category: 'all',
    priority: 'all',
    read_status: 'all',
  });
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  const { data: unreadCount } = useUnreadNotificationCount();
  const { data, isLoading, refetch } = useInAppNotifications({
    category: filters.category !== 'all' ? filters.category : undefined,
    unread_only: filters.read_status === 'unread' ? true : undefined,
    limit: LIMIT,
    offset: (page - 1) * LIMIT,
  });

  const markAsReadMutation = useMarkNotificationAsRead();
  const markAllAsReadMutation = useMarkAllNotificationsAsRead();

  // Auth check
  if (authLoading) {
    return <NotificationsPageSkeleton />;
  }

  if (!user || !resident) {
    router.push('/login');
    return null;
  }

  const notifications = data?.data || [];
  const hasMore = data && notifications.length >= LIMIT;

  const handleMarkAsRead = (id: string) => {
    markAsReadMutation.mutate(id);
  };

  const handleMarkAllAsRead = () => {
    markAllAsReadMutation.mutate();
  };

  const handleItemClick = (notification: InAppNotification) => {
    if (!notification.is_read) {
      handleMarkAsRead(notification.id);
    }
    if (notification.action_url) {
      router.push(notification.action_url);
    }
  };

  // Filter notifications by read status (client-side for read vs unread toggle)
  const filteredNotifications = notifications.filter((n) => {
    if (filters.read_status === 'unread') return !n.is_read;
    if (filters.read_status === 'read') return n.is_read;
    return true;
  });

  return (
    <div className="container mx-auto p-4 max-w-4xl space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-bill-text">Notifications</h1>
          <p className="text-sm text-bill-text-secondary mt-1">
            {unreadCount ? (
              <span className="font-medium text-bill-primary">{unreadCount} unread</span>
            ) : (
              'You're all caught up!'
            )}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleMarkAllAsRead}
          disabled={!unreadCount || markAllAsReadMutation.isPending}
          className="w-full sm:w-auto"
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Mark all read
        </Button>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.1 }}
        className="flex flex-col md:flex-row gap-3 p-4 bg-bill-card/50 rounded-lg border border-border"
      >
        {/* Category Filter */}
        <div className="flex-1 min-w-[200px]">
          <Select
            value={filters.category}
            onValueChange={(val) => setFilters({ ...filters, category: val })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="announcement">Announcements</SelectItem>
              <SelectItem value="payment">Payments</SelectItem>
              <SelectItem value="security">Security</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Read Status Toggle */}
        <ToggleGroup
          type="single"
          value={filters.read_status}
          onValueChange={(val) => val && setFilters({ ...filters, read_status: val })}
          className="flex-wrap justify-start md:justify-center"
        >
          <ToggleGroupItem value="all" className="min-w-[70px]">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="unread" className="min-w-[70px]">
            Unread
          </ToggleGroupItem>
          <ToggleGroupItem value="read" className="min-w-[70px]">
            Read
          </ToggleGroupItem>
        </ToggleGroup>
      </motion.div>

      {/* Notifications List */}
      <AnimatePresence mode="popLayout">
        {isLoading ? (
          <NotificationsListSkeleton />
        ) : filteredNotifications.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center py-16"
          >
            {filters.category !== 'all' || filters.read_status !== 'all' ? (
              <div>
                <Filter className="h-12 w-12 mx-auto text-bill-text-secondary/50 mb-3" />
                <h3 className="text-base font-medium text-bill-text">No notifications found</h3>
                <p className="text-sm text-bill-text-secondary mt-1">
                  Try adjusting your filters
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFilters({ category: 'all', priority: 'all', read_status: 'all' })}
                  className="mt-4"
                >
                  Clear Filters
                </Button>
              </div>
            ) : (
              <div>
                <Bell className="h-16 w-16 mx-auto text-bill-text-secondary/50 mb-4" />
                <h3 className="text-lg font-medium text-bill-text">No notifications</h3>
                <p className="text-sm text-bill-text-secondary mt-1">
                  You're all caught up!
                </p>
              </div>
            )}
          </motion.div>
        ) : (
          <div className="space-y-3">
            {filteredNotifications.map((notification, index) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onClick={() => handleItemClick(notification)}
                index={index}
              />
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Pagination */}
      {hasMore && (
        <div className="mt-6 text-center">
          <Button variant="outline" onClick={() => setPage((p) => p + 1)}>
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  notification,
  onClick,
  index,
}: {
  notification: InAppNotification;
  onClick: () => void;
  index: number;
}) {
  const Icon = categoryIcons[notification.category as keyof typeof categoryIcons] || Bell;
  const isUnread = !notification.is_read;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ ...spring, delay: index * 0.05 }}
      layout
    >
      <Card
        className={cn(
          'transition-all hover:shadow-md cursor-pointer',
          isUnread && 'border-l-4 border-l-bill-mint'
        )}
        onClick={onClick}
      >
        <CardContent className="p-4">
          <div className="flex gap-4">
            {/* Icon */}
            <div
              className={cn(
                'flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center',
                notification.priority === 'urgent'
                  ? 'bg-red-100 text-red-600'
                  : notification.priority === 'high'
                  ? 'bg-orange-100 text-orange-600'
                  : 'bg-bill-secondary text-bill-text'
              )}
            >
              <Icon className="h-6 w-6" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3
                  className={cn(
                    'text-base',
                    isUnread ? 'font-semibold text-bill-text' : 'font-medium text-bill-text-secondary'
                  )}
                >
                  {notification.title}
                </h3>
                {isUnread && (
                  <Badge variant="default" className="text-xs bg-bill-mint text-white shrink-0">
                    New
                  </Badge>
                )}
              </div>
              <p className="text-sm text-bill-text-secondary mt-1 line-clamp-2">
                {notification.body}
              </p>
              <div className="flex items-center gap-4 mt-2 text-xs text-bill-text-secondary">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                </span>
                <Badge variant="outline" className="text-xs">
                  {notification.category}
                </Badge>
                {!isUnread && (
                  <Badge variant="outline" className="text-xs flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Read
                  </Badge>
                )}
              </div>
            </div>

            {/* Action */}
            {notification.action_url && (
              <div className="flex items-center">
                <ChevronRight className="h-5 w-5 text-bill-text-secondary" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function NotificationsListSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex gap-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function NotificationsPageSkeleton() {
  return (
    <div className="container mx-auto p-4 max-w-4xl space-y-6">
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <Skeleton className="h-16 w-full" />
      <NotificationsListSkeleton />
    </div>
  );
}
