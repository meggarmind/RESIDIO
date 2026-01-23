'use client';

import { useQuery } from '@tanstack/react-query';
import { getCronStatus } from '@/actions/system/cron-status';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Activity,
  Calendar,
  Mail,
  Bell,
  FileText,
  Megaphone,
  Info,
  Clock,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { POLLING_INTERVALS } from '@/lib/config/polling';
import { Skeleton } from '@/components/ui/skeleton';

const statusIcons = {
  healthy: <CheckCircle className="h-5 w-5 text-green-600" />,
  warning: <AlertTriangle className="h-5 w-5 text-yellow-600" />,
  critical: <XCircle className="h-5 w-5 text-red-600" />,
  unknown: <Activity className="h-5 w-5 text-gray-400" />,
};

const statusColors = {
  healthy: 'bg-green-100 text-green-800 border-green-200',
  warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  critical: 'bg-red-100 text-red-800 border-red-200',
  unknown: 'bg-gray-100 text-gray-800 border-gray-200',
};

const jobIcons = {
  'invoice-generation': <FileText className="h-5 w-5" />,
  'report-generation': <Calendar className="h-5 w-5" />,
  'notification-processing': <Bell className="h-5 w-5" />,
  'announcement-publishing': <Megaphone className="h-5 w-5" />,
  'email-import': <Mail className="h-5 w-5" />,
};

export default function CronStatusPage() {
  const {
    data: status,
    isLoading,
    refetch,
    isFetching,
    dataUpdatedAt
  } = useQuery({
    queryKey: ['cron-status'],
    queryFn: async () => {
      const result = await getCronStatus();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    refetchInterval: POLLING_INTERVALS.REALTIME,
  });

  const overallBadgeColor =
    status?.overall === 'critical'
      ? 'destructive'
      : status?.overall === 'warning'
        ? 'outline'
        : 'default';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Cron Job Status
        </h3>
        <p className="text-sm text-muted-foreground">
          Monitor the health of scheduled background jobs
        </p>
      </div>

      <Separator />

      {/* Info Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          This dashboard monitors all scheduled cron jobs. Status updates every 30 seconds
          automatically. Jobs are marked as healthy (green), warning (yellow), or critical (red)
          based on their expected run frequency.
        </AlertDescription>
      </Alert>

      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {status && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Overall Status:</span>
              <Badge variant={overallBadgeColor} className="flex items-center gap-1">
                {statusIcons[status.overall as keyof typeof statusIcons]}
                {status.overall.charAt(0).toUpperCase() + status.overall.slice(1)}
              </Badge>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {dataUpdatedAt ? `Last refresh: ${formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}` : 'Refreshing...'}
          </span>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Job Status Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 w-32 bg-muted rounded" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-4 w-full bg-muted rounded" />
                  <div className="h-4 w-3/4 bg-muted rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : status?.jobs ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {status.jobs.map((job: any) => (
            <Card
              key={job.name}
              className={`border-2 ${statusColors[job.status as keyof typeof statusColors]}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`rounded-lg p-2 ${job.status === 'healthy' ? 'bg-green-100' : job.status === 'warning' ? 'bg-yellow-100' : job.status === 'critical' ? 'bg-red-100' : 'bg-gray-100'}`}>
                      {jobIcons[job.name as keyof typeof jobIcons] || <Activity className="h-5 w-5" />}
                    </div>
                    <div>
                      <CardTitle className="text-sm">{job.description}</CardTitle>
                      <CardDescription className="text-xs mt-1">
                        {job.schedule}
                      </CardDescription>
                    </div>
                  </div>
                  {statusIcons[job.status as keyof typeof statusIcons]}
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {/* Status Badge */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Status:</span>
                  <Badge
                    variant={
                      job.status === 'critical'
                        ? 'destructive'
                        : job.status === 'warning'
                          ? 'outline'
                          : 'default'
                    }
                    className="text-xs"
                  >
                    {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                  </Badge>
                </div>

                {/* Last Run */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Last Run:</span>
                  <span className="font-medium">
                    {job.lastRun ? job.lastRunRelative : 'Never'}
                  </span>
                </div>

                {/* Expected Frequency */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Frequency:</span>
                  <span className="font-medium capitalize">{job.expectedFrequency}</span>
                </div>

                <Separator />

                {/* Message */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Status Message:</p>
                  <p
                    className={`text-xs font-medium ${job.status === 'critical'
                        ? 'text-red-700'
                        : job.status === 'warning'
                          ? 'text-yellow-700'
                          : 'text-green-700'
                      }`}
                  >
                    {job.message}
                  </p>
                </div>

                {/* Absolute timestamp (tooltip) */}
                {job.lastRun && (
                  <div className="text-xs text-muted-foreground pt-2 border-t">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(job.lastRun), 'MMM d, yyyy HH:mm:ss')}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="text-center py-8 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No cron job data available</p>
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Status Legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <div>
                <p className="font-medium">Healthy</p>
                <p className="text-muted-foreground">Running on schedule</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <div>
                <p className="font-medium">Warning</p>
                <p className="text-muted-foreground">Missed 1 run or minor issues</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-600" />
              <div>
                <p className="font-medium">Critical</p>
                <p className="text-muted-foreground">Missed 2+ runs or failed</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
