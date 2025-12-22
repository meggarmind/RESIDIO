'use client';

/**
 * Notification Schedules Management Page
 */

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ArrowLeft, Plus } from 'lucide-react';
import { ScheduleList } from '@/components/notifications/schedule-list';
import { ScheduleForm } from '@/components/notifications/schedule-form';
import type { ScheduleWithTemplate } from '@/lib/notifications/types';

export default function NotificationSchedulesPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editSchedule, setEditSchedule] = useState<ScheduleWithTemplate | null>(null);

  const handleCreateSuccess = () => {
    setIsCreateOpen(false);
  };

  const handleEditSuccess = () => {
    setEditSchedule(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/settings/notifications">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h3 className="text-lg font-medium">Notification Schedules</h3>
            <p className="text-sm text-muted-foreground">
              Configure when and how notifications are triggered
            </p>
          </div>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Schedule
        </Button>
      </div>
      <Separator />

      <ScheduleList onEdit={setEditSchedule} />

      {/* Create Schedule Dialog */}
      <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Create Schedule</SheetTitle>
            <SheetDescription>
              Configure when notifications should be triggered
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <ScheduleForm
              onSuccess={handleCreateSuccess}
              onCancel={() => setIsCreateOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit Schedule Dialog */}
      <Sheet open={!!editSchedule} onOpenChange={() => setEditSchedule(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Schedule</SheetTitle>
            <SheetDescription>
              Update the schedule configuration
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            {editSchedule && (
              <ScheduleForm
                schedule={editSchedule}
                onSuccess={handleEditSuccess}
                onCancel={() => setEditSchedule(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
