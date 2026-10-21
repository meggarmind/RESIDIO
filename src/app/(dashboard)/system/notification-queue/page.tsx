'use client';

import Link from 'next/link';
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
        <p className="mt-1 text-sm text-muted-foreground">
          WhatsApp assistant replies do not use this queue. See them under{' '}
          <Link href="/settings/whatsapp#sent-messages" className="underline">Settings &gt; WhatsApp &gt; Sent messages</Link>.
        </p>
      </div>

      <QueueViewer />
    </div>
  );
}
