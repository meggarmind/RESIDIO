'use client';

/**
 * Notification History & Queue Management Page
 */

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, History, ListTodo } from 'lucide-react';
import { NotificationHistory } from '@/components/notifications/notification-history';
import { QueueViewer } from '@/components/notifications/queue-viewer';

export default function NotificationHistoryPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/settings/notifications">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h3 className="text-lg font-medium">Notification History & Queue</h3>
          <p className="text-sm text-muted-foreground">
            View sent notifications and manage the outgoing queue
          </p>
        </div>
      </div>
      <Separator />

      <Tabs defaultValue="history" className="space-y-6">
        <TabsList>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            History
          </TabsTrigger>
          <TabsTrigger value="queue" className="flex items-center gap-2">
            <ListTodo className="h-4 w-4" />
            Queue
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history">
          <NotificationHistory />
        </TabsContent>

        <TabsContent value="queue">
          <QueueViewer />
        </TabsContent>
      </Tabs>
    </div>
  );
}
