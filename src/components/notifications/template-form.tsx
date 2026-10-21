'use client';

/**
 * Wording editor for one event on one channel, email (#907) or Chatmaid WhatsApp (#908).
 *
 * Each field shows the built-in text as its placeholder. Leaving a field empty, or pressing
 * "Reset to default", means that field uses the built-in text.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useUpdateEventContent } from '@/hooks/use-notifications';
import {
  WHATSAPP_MAX_CONTENT_LENGTH,
  getChannelContent,
  isEventKey,
  validateOverrides,
} from '@/lib/notifications/event-content-registry';
import type { NotificationTemplate } from '@/lib/notifications/types';

interface TemplateFormProps {
  template: NotificationTemplate;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function TemplateForm({ template, onSuccess, onCancel }: TemplateFormProps) {
  const updateContent = useUpdateEventContent();
  const event = template.event && isEventKey(template.event) ? template.event : null;
  const channel = template.channel === 'whatsapp' ? 'whatsapp' : 'email';
  const [values, setValues] = useState<Record<string, string>>(template.overrides ?? {});

  if (!event) {
    return <p className="text-sm text-muted-foreground">This template is not editable.</p>;
  }

  const definition = getChannelContent(event, channel);
  if (!definition) {
    return <p className="text-sm text-muted-foreground">This template is not editable.</p>;
  }
  const groups = [...new Set(definition.fields.map((field) => field.group ?? ''))];

  const setField = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));
  const resetField = (key: string) =>
    setValues((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const overrides = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value.trim() !== '')
    );
    const checked = validateOverrides(event, overrides, channel);
    if (!checked.ok) {
      toast.error(checked.errors.join('; '));
      return;
    }
    try {
      await updateContent.mutateAsync({ event, channel, overrides });
      onSuccess?.();
    } catch {
      // The mutation hook already toasts the error.
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium">Variables you can use</p>
        <div className="flex flex-wrap gap-2">
          {definition.variables.map((variable) => (
            <Badge key={variable.name} variant="outline" title={variable.description}>
              {`{{${variable.name}}}`}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Separate paragraphs with a blank line. Variables outside this list are rejected.
        </p>
      </div>

      {groups.map((group) => (
        <fieldset key={group} className="space-y-4">
          {group && <legend className="text-sm font-semibold">{group}</legend>}
          {definition.fields
            .filter((field) => (field.group ?? '') === group)
            .map((field) => {
              const id = `field-${field.key}`;
              const edited = (values[field.key] ?? '').trim() !== '';
              return (
                <div key={field.key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={id}>{field.label}</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!edited}
                      onClick={() => resetField(field.key)}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      Reset to default
                    </Button>
                  </div>
                  {field.multiline ? (
                    <Textarea
                      id={id}
                      rows={4}
                      maxLength={channel === 'whatsapp' ? WHATSAPP_MAX_CONTENT_LENGTH : undefined}
                      value={values[field.key] ?? ''}
                      placeholder={field.default}
                      onChange={(e) => setField(field.key, e.target.value)}
                    />
                  ) : (
                    <Input
                      id={id}
                      value={values[field.key] ?? ''}
                      placeholder={field.default}
                      onChange={(e) => setField(field.key, e.target.value)}
                    />
                  )}
                </div>
              );
            })}
        </fieldset>
      ))}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={updateContent.isPending}>
          {updateContent.isPending ? 'Saving...' : 'Save wording'}
        </Button>
      </div>
    </form>
  );
}
