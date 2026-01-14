'use client';

/**
 * Notifications Settings Dashboard
 *
 * Overview page for notification system management with links to templates, schedules, and history.
 */

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Mail,
  Clock,
  History,
  FileText,
  Settings2,
  ArrowRight,
  Bell,
  MessageSquare,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { useNotificationTemplates, useNotificationSchedules, useQueueStatistics, useNotificationStats } from '@/hooks/use-notifications';
import { NOTIFICATION_CHANNEL_LABELS, isChannelImplemented } from '@/lib/notifications/types';
import type { NotificationChannel } from '@/lib/notifications/types';

export default function NotificationsSettingsPage() {
  const { data: templates, isLoading: templatesLoading } = useNotificationTemplates();
  const { data: schedules, isLoading: schedulesLoading } = useNotificationSchedules();
  const { data: queueStats, isLoading: queueLoading } = useQueueStatistics();
  const { data: historyStats, isLoading: historyLoading } = useNotificationStats();

  const activeTemplates = templates?.filter(t => t.is_active).length || 0;
  const totalTemplates = templates?.length || 0;
  const activeSchedules = schedules?.filter(s => s.is_active).length || 0;
  const totalSchedules = schedules?.length || 0;

  const channels: NotificationChannel[] = ['email', 'sms', 'whatsapp'];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Notifications</h3>
        <p className="text-sm text-muted-foreground">
          Manage notification templates, schedules, and view notification history.
        </p>
      </div>
      <Separator />

      {/* Channel Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notification Channels</CardTitle>
          <CardDescription>Available channels for sending notifications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {channels.map((channel) => {
              const implemented = isChannelImplemented(channel);
              const Icon = channel === 'email' ? Mail : channel === 'sms' ? MessageSquare : Bell;
              return (
                <div
                  key={channel}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    implemented ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800' : 'bg-muted/50'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${implemented ? 'text-green-600' : 'text-muted-foreground'}`} />
                  <div className="flex-1">
                    <p className="font-medium">{NOTIFICATION_CHANNEL_LABELS[channel]}</p>
                    <p className="text-xs text-muted-foreground">
                      {implemented ? 'Active' : 'Coming soon'}
                    </p>
                  </div>
                  {implemented ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Templates */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Templates</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {templatesLoading ? '...' : activeTemplates}
            </div>
            <p className="text-xs text-muted-foreground">
              {totalTemplates - activeTemplates} inactive
            </p>
          </CardContent>
        </Card>

        {/* Schedules */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Schedules</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {schedulesLoading ? '...' : activeSchedules}
            </div>
            <p className="text-xs text-muted-foreground">
              {totalSchedules - activeSchedules} inactive
            </p>
          </CardContent>
        </Card>

        {/* Queue */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Queue</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {queueLoading ? '...' : queueStats?.pending || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              pending notifications
            </p>
          </CardContent>
        </Card>

        {/* Sent Today */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sent</CardTitle>
            <History className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {historyLoading ? '...' : historyStats?.sent || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {historyStats?.failed || 0} failed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Templates */}
        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Templates
            </CardTitle>
            <CardDescription>
              Create and manage notification message templates with variables
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Badge variant="secondary">{totalTemplates} total</Badge>
              <Badge variant="default">{activeTemplates} active</Badge>
            </div>
            <Button asChild className="w-full">
              <Link href="/settings/notifications/templates">
                Manage Templates
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Schedules */}
        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Schedules
            </CardTitle>
            <CardDescription>
              Configure when and how notifications are triggered
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Badge variant="secondary">{totalSchedules} total</Badge>
              <Badge variant="default">{activeSchedules} active</Badge>
            </div>
            <Button asChild className="w-full">
              <Link href="/settings/notifications/schedules">
                Manage Schedules
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* History */}
        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              History
            </CardTitle>
            <CardDescription>
              View sent notifications and delivery status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Badge variant="secondary">{historyStats?.total || 0} total</Badge>
              <Badge variant="outline" className="text-green-600">
                {historyStats?.delivered || 0} delivered
              </Badge>
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link href="/settings/notifications/history">
                View History
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Queue Status */}
      {queueStats && (queueStats.pending > 0 || queueStats.failed > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Queue Status</CardTitle>
            <CardDescription>Current notification queue overview</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {queueStats.pending > 0 && (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-yellow-500" />
                  <span className="text-sm">{queueStats.pending} pending</span>
                </div>
              )}
              {queueStats.processing > 0 && (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-sm">{queueStats.processing} processing</span>
                </div>
              )}
              {queueStats.failed > 0 && (
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-red-600">{queueStats.failed} failed</span>
                </div>
              )}
              {queueStats.sent > 0 && (
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm">{queueStats.sent} sent</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
