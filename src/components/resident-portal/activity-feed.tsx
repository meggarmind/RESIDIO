'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CreditCard,
  FileText,
  Shield,
  Bell,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ActivityItem {
  id: string;
  type: 'payment' | 'invoice' | 'document' | 'security' | 'system';
  title: string;
  description: string;
  timestamp: Date;
  status?: 'success' | 'pending' | 'info';
}

const activityIcons = {
  payment: CreditCard,
  invoice: FileText,
  document: FileText,
  security: Shield,
  system: Bell,
};

const statusColors = {
  success: 'bg-green-500/10 text-green-600 dark:text-green-400',
  pending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  info: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
};

interface ActivityFeedProps {
  activities?: ActivityItem[];
  isLoading?: boolean;
}

export function ActivityFeed({ activities = [], isLoading }: ActivityFeedProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3 animate-pulse">
                <div className="h-8 w-8 rounded-lg bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-3/4 bg-muted rounded" />
                  <div className="h-3 w-1/2 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="p-3 rounded-full bg-muted mb-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No recent activity</p>
            <p className="text-xs text-muted-foreground mt-1">
              Your account activity will appear here
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.slice(0, 5).map((activity) => {
            const Icon = activityIcons[activity.type];
            return (
              <div key={activity.id} className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${statusColors[activity.status || 'info']}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium truncate">{activity.title}</p>
                    {activity.status === 'success' && (
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {activity.description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
