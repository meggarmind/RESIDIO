'use client';

/**
 * Notification Schedule List Component
 *
 * Displays a table of notification schedules with actions.
 */

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  Calendar,
  Clock,
  Zap,
  RefreshCw,
} from 'lucide-react';
import {
  useNotificationSchedules,
  useDeleteSchedule,
  useToggleScheduleActive,
} from '@/hooks/use-notifications';
import { TRIGGER_TYPE_LABELS } from '@/lib/notifications/types';
import type { ScheduleWithTemplate, TriggerType } from '@/lib/notifications/types';

interface ScheduleListProps {
  onEdit?: (schedule: ScheduleWithTemplate) => void;
}

export function ScheduleList({ onEdit }: ScheduleListProps) {
  const { data: schedules, isLoading } = useNotificationSchedules();
  const deleteSchedule = useDeleteSchedule();
  const toggleActive = useToggleScheduleActive();

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (deleteId) {
      await deleteSchedule.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  const getTriggerIcon = (type: TriggerType) => {
    switch (type) {
      case 'days_before_due':
      case 'days_after_due':
        return <Calendar className="h-4 w-4" />;
      case 'event':
        return <Zap className="h-4 w-4" />;
      case 'cron':
        return <RefreshCw className="h-4 w-4" />;
    }
  };

  const getTriggerDescription = (schedule: ScheduleWithTemplate) => {
    switch (schedule.trigger_type) {
      case 'days_before_due':
        return `${schedule.trigger_value} days before due`;
      case 'days_after_due':
        return `${schedule.trigger_value} days after due`;
      case 'event':
        return schedule.event_type || 'On event';
      case 'cron':
        return schedule.cron_expression || 'Scheduled';
      default:
        return schedule.trigger_type;
    }
  };

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading schedules...</div>;
  }

  if (!schedules || schedules.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No schedules found. Create your first schedule to automate notifications.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Escalation</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedules.map((schedule) => (
              <TableRow key={schedule.id}>
                <TableCell>
                  <div className="font-medium">{schedule.name}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {schedule.template?.display_name || 'Unknown'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {schedule.template?.category}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getTriggerIcon(schedule.trigger_type as TriggerType)}
                    <div>
                      <div className="text-sm">
                        {TRIGGER_TYPE_LABELS[schedule.trigger_type as TriggerType]}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {getTriggerDescription(schedule)}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {schedule.escalation_sequence > 0 ? (
                    <Badge variant="outline">Level {schedule.escalation_sequence}</Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">Initial</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={schedule.is_active ? 'default' : 'secondary'}>
                    {schedule.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {onEdit && (
                        <DropdownMenuItem onClick={() => onEdit(schedule)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => toggleActive.mutate(schedule.id)}>
                        {schedule.is_active ? (
                          <>
                            <PowerOff className="mr-2 h-4 w-4" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <Power className="mr-2 h-4 w-4" />
                            Activate
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => setDeleteId(schedule.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Schedule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this schedule? This action cannot be undone.
              Pending notifications using this schedule will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
