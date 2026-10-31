'use client';

import Link from 'next/link';
import { QueueViewer } from '@/components/notifications/queue-viewer';

export default function NotificationQueuePage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-medium">Notification queue</h3>
        <p className="text-sm text-muted-foreground">
          View notifications waiting to be sent, cancel a pending item, or retry one that failed.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          WhatsApp assistant replies do not use this queue. See them under{' '}
          <Link href="/system/whatsapp-monitoring" className="underline">WhatsApp activity</Link>.
        </p>
      </div>

      <QueueViewer />
    </div>
  );
}
