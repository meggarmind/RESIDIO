'use client';

import { NotificationHistory } from '@/components/notifications/notification-history';

export default function NotificationHistoryPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-medium">Notification History</h3>
        <p className="text-sm text-muted-foreground">
          View sent notifications and their delivery status.
        </p>
      </div>

      <NotificationHistory />
    </div>
  );
}
