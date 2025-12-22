'use client';

/**
 * Notification Template Form Component
 *
 * Form for creating and editing notification templates.
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Plus, Info } from 'lucide-react';
import { useCreateTemplate, useUpdateTemplate } from '@/hooks/use-notifications';
import {
  NOTIFICATION_CATEGORY_LABELS,
  NOTIFICATION_CHANNEL_LABELS,
  isChannelImplemented,
} from '@/lib/notifications/types';
import type {
  NotificationTemplate,
  NotificationCategory,
  NotificationChannel,
  TemplateVariable,
} from '@/lib/notifications/types';

type TemplateFormData = {
  name: string;
  display_name: string;
  category: 'payment' | 'invoice' | 'security' | 'general';
  channel: 'email' | 'sms' | 'whatsapp';
  subject_template?: string;
  body_template: string;
  html_template?: string;
  is_active: boolean;
  variables: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
};

const templateSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').regex(/^[a-z_]+$/, 'Name must be lowercase with underscores only'),
  display_name: z.string().min(3, 'Display name must be at least 3 characters'),
  category: z.enum(['payment', 'invoice', 'security', 'general']),
  channel: z.enum(['email', 'sms', 'whatsapp']),
  subject_template: z.string().optional(),
  body_template: z.string().min(10, 'Body must be at least 10 characters'),
  html_template: z.string().optional(),
  is_active: z.boolean(),
  variables: z.array(z.object({
    name: z.string(),
    description: z.string(),
    required: z.boolean(),
  })),
}) satisfies z.ZodType<TemplateFormData>;

interface TemplateFormProps {
  template?: NotificationTemplate;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function TemplateForm({ template, onSuccess, onCancel }: TemplateFormProps) {
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();

  const isEditing = !!template;

  const form = useForm<TemplateFormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: template?.name || '',
      display_name: template?.display_name || '',
      category: (template?.category as NotificationCategory) || 'general',
      channel: (template?.channel as NotificationChannel) || 'email',
      subject_template: template?.subject_template || '',
      body_template: template?.body_template || '',
      html_template: template?.html_template || '',
      is_active: template?.is_active ?? true,
      variables: template?.variables || [],
    },
  });

  const variables = form.watch('variables');
  const channel = form.watch('channel');

  const addVariable = () => {
    const currentVars = form.getValues('variables');
    form.setValue('variables', [
      ...currentVars,
      { name: '', description: '', required: false },
    ]);
  };

  const removeVariable = (index: number) => {
    const currentVars = form.getValues('variables');
    form.setValue('variables', currentVars.filter((_, i) => i !== index));
  };

  const updateVariable = (index: number, field: keyof TemplateVariable, value: string | boolean) => {
    const currentVars = form.getValues('variables');
    const updated = [...currentVars];
    updated[index] = { ...updated[index], [field]: value };
    form.setValue('variables', updated);
  };

  const onSubmit = async (data: TemplateFormData) => {
    try {
      if (isEditing) {
        await updateTemplate.mutateAsync({
          id: template.id,
          input: data,
        });
      } else {
        await createTemplate.mutateAsync(data);
      }
      onSuccess?.();
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const categories = Object.entries(NOTIFICATION_CATEGORY_LABELS) as [NotificationCategory, string][];
  const channels = Object.entries(NOTIFICATION_CHANNEL_LABELS) as [NotificationChannel, string][];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Internal Name</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="payment_reminder_7day"
                    disabled={isEditing}
                  />
                </FormControl>
                <FormDescription>
                  Lowercase with underscores, used in code
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="display_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Display Name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Payment Reminder (7 Days)" />
                </FormControl>
                <FormDescription>
                  Human-readable name shown in UI
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {categories.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="channel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Channel</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select channel" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {channels.map(([value, label]) => (
                      <SelectItem
                        key={value}
                        value={value}
                        disabled={!isChannelImplemented(value)}
                      >
                        {label}
                        {!isChannelImplemented(value) && ' (Coming soon)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {channel === 'email' && (
          <FormField
            control={form.control}
            name="subject_template"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Subject Template</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Payment Reminder: {{invoice_number}}" />
                </FormControl>
                <FormDescription>
                  Email subject with {'{{variable}}'} placeholders
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="body_template"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Body Template</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Dear {{resident_name}},&#10;&#10;Your payment of ₦{{amount_due}} is due on {{due_date}}."
                  rows={8}
                />
              </FormControl>
              <FormDescription>
                Message body with {'{{variable}}'} placeholders
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {channel === 'email' && (
          <FormField
            control={form.control}
            name="html_template"
            render={({ field }) => (
              <FormItem>
                <FormLabel>HTML Template (Optional)</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder="<p>Dear {{resident_name}},</p>"
                    rows={4}
                  />
                </FormControl>
                <FormDescription>
                  Optional HTML version for rich email content
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Variables Section */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Template Variables</CardTitle>
                <CardDescription>
                  Define variables used in this template
                </CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addVariable}>
                <Plus className="h-4 w-4 mr-1" />
                Add Variable
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {variables.length === 0 ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2 py-4">
                <Info className="h-4 w-4" />
                No variables defined. Add variables to make your template dynamic.
              </div>
            ) : (
              variables.map((variable, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input
                      value={variable.name}
                      onChange={(e) => updateVariable(index, 'name', e.target.value)}
                      placeholder="variable_name"
                    />
                    <Input
                      value={variable.description}
                      onChange={(e) => updateVariable(index, 'description', e.target.value)}
                      placeholder="Description"
                    />
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={variable.required}
                        onCheckedChange={(checked) => updateVariable(index, 'required', checked)}
                      />
                      <span className="text-sm">Required</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeVariable(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
            {variables.length > 0 && (
              <div className="pt-2">
                <p className="text-xs text-muted-foreground">
                  Use these in your template: {variables.map(v => `{{${v.name}}}`).join(', ')}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

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
                  Only active templates can be used for sending notifications
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
            disabled={createTemplate.isPending || updateTemplate.isPending}
          >
            {createTemplate.isPending || updateTemplate.isPending
              ? 'Saving...'
              : isEditing
              ? 'Update Template'
              : 'Create Template'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
