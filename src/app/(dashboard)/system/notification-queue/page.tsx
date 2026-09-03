'use client';

import { QueueViewer } from '@/components/notifications/queue-viewer';

export default function NotificationQueuePage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-medium">Notification Queue</h3>
        <p className="text-sm text-muted-foreground">
          View notifications waiting to be sent, cancel a pending item, or retry one that failed.
        </p>
      </div>

      <QueueViewer />
    </div>
  );
}
