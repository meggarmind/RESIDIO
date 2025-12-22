'use client';

/**
 * Notification Schedule Form Component
 *
 * Form for creating and editing notification schedules.
 */

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  useNotificationTemplates,
  useCreateSchedule,
  useUpdateSchedule,
} from '@/hooks/use-notifications';
import {
  TRIGGER_TYPE_LABELS,
  NOTIFICATION_EVENT_LABELS,
} from '@/lib/notifications/types';
import type {
  ScheduleWithTemplate,
  TriggerType,
  NotificationEventType,
} from '@/lib/notifications/types';

type ScheduleFormData = {
  name: string;
  template_id: string;
  trigger_type: 'days_before_due' | 'days_after_due' | 'event' | 'cron';
  trigger_value?: number;
  cron_expression?: string;
  event_type?: string;
  escalation_sequence: number;
  is_active: boolean;
};

const scheduleSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  template_id: z.string().min(1, 'Please select a template'),
  trigger_type: z.enum(['days_before_due', 'days_after_due', 'event', 'cron']),
  trigger_value: z.number().optional(),
  cron_expression: z.string().optional(),
  event_type: z.string().optional(),
  escalation_sequence: z.number().min(0),
  is_active: z.boolean(),
}) satisfies z.ZodType<ScheduleFormData>;

interface ScheduleFormProps {
  schedule?: ScheduleWithTemplate;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ScheduleForm({ schedule, onSuccess, onCancel }: ScheduleFormProps) {
  const { data: templates } = useNotificationTemplates({ activeOnly: true });
  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule();

  const isEditing = !!schedule;

  const form = useForm<ScheduleFormData>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      name: schedule?.name || '',
      template_id: schedule?.template_id || '',
      trigger_type: (schedule?.trigger_type as TriggerType) || 'days_before_due',
      trigger_value: schedule?.trigger_value ?? undefined,
      cron_expression: schedule?.cron_expression || '',
      event_type: schedule?.event_type || '',
      escalation_sequence: schedule?.escalation_sequence ?? 0,
      is_active: schedule?.is_active ?? true,
    },
  });

  const triggerType = form.watch('trigger_type');

  const onSubmit = async (data: ScheduleFormData) => {
    try {
      const submitData = {
        name: data.name,
        template_id: data.template_id,
        trigger_type: data.trigger_type,
        trigger_value: data.trigger_value,
        cron_expression: data.cron_expression || undefined,
        event_type: data.event_type as NotificationEventType | undefined,
        escalation_sequence: data.escalation_sequence,
        is_active: data.is_active,
      };

      if (isEditing) {
        await updateSchedule.mutateAsync({
          id: schedule.id,
          input: submitData,
        });
      } else {
        await createSchedule.mutateAsync(submitData);
      }
      onSuccess?.();
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const triggerTypes = Object.entries(TRIGGER_TYPE_LABELS) as [TriggerType, string][];
  const eventTypes = Object.entries(NOTIFICATION_EVENT_LABELS) as [NotificationEventType, string][];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Schedule Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Payment Reminder - 7 Days Before" />
              </FormControl>
              <FormDescription>
                A descriptive name for this schedule
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="template_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Template</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {templates?.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.display_name}
                      <span className="text-muted-foreground ml-2">
                        ({template.category})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                The notification template to use
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="trigger_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Trigger Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select trigger type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {triggerTypes.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                When this notification should be triggered
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Conditional fields based on trigger type */}
        {(triggerType === 'days_before_due' || triggerType === 'days_after_due') && (
          <FormField
            control={form.control}
            name="trigger_value"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Number of Days</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="7"
                  />
                </FormControl>
                <FormDescription>
                  How many days {triggerType === 'days_before_due' ? 'before' : 'after'} the due date
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {triggerType === 'event' && (
          <FormField
            control={form.control}
            name="event_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Event Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select event" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {eventTypes.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  The event that triggers this notification
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {triggerType === 'cron' && (
          <FormField
            control={form.control}
            name="cron_expression"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cron Expression</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="0 9 * * *" />
                </FormControl>
                <FormDescription>
                  Cron expression for scheduled execution (e.g., &quot;0 9 * * *&quot; for daily at 9am)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="escalation_sequence"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Escalation Level</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  value={field.value}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
              </FormControl>
              <FormDescription>
                Order in escalation workflow (0 = initial, 1 = first escalation, etc.)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="is_active"
          render={({ field }) => (
            <FormItem className="flex items-center gap-3 rounded-lg border p-4">
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <div>
                <FormLabel className="text-base mb-0">Active</FormLabel>
                <FormDescription className="mt-0.5">
                  Only active schedules will trigger notifications
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        <div className="flex gap-3 justify-end">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            disabled={createSchedule.isPending || updateSchedule.isPending}
          >
            {createSchedule.isPending || updateSchedule.isPending
              ? 'Saving...'
              : isEditing
              ? 'Update Schedule'
              : 'Create Schedule'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
