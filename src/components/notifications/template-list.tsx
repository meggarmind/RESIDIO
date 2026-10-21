'use client';

/**
 * Notification Template List Component
 *
 * Lists the events whose wording an admin can edit on one channel: the resident emails (#907) or
 * the Chatmaid WhatsApp texts (#908). The set is fixed by the event registry, so there is nothing
 * to create, duplicate or delete here.
 *
 * WhatsApp through Meta or Twilio sends code-owned approved templates, so those rows are read-only:
 * the template name and the order its parameters are filled in.
 */

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { IconBox } from '@/components/ui/icon-box';
import { Eye, Mail, MessageCircle, Pencil } from 'lucide-react';
import { useNotificationTemplates, useSetEventChannelEnabled } from '@/hooks/use-notifications';
import {
  EVENT_KEYS,
  EVENT_REGISTRY,
  getChannelContent,
  getToggleableChannels,
  type ContentChannel,
} from '@/lib/notifications/event-content-registry';
import type { NotificationTemplate } from '@/lib/notifications/types';

interface TemplateListProps {
  channel?: ContentChannel;
  /** WhatsApp only: the active provider. Anything but Chatmaid shows the code-owned template read-only. */
  whatsappProvider?: string | null;
  /** Edit controls show only when the viewer holds notifications.manage. */
  canManage: boolean;
  onEdit?: (template: NotificationTemplate) => void;
  onPreview?: (template: NotificationTemplate) => void;
}

export function TemplateList({
  channel = 'email',
  whatsappProvider,
  canManage,
  onEdit,
  onPreview,
}: TemplateListProps) {
  const { data: templates, isLoading } = useNotificationTemplates({ channel });
  const setEnabled = useSetEventChannelEnabled();
  const readOnly = channel === 'whatsapp' && whatsappProvider !== 'chatmaid';

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  }

  const rows = EVENT_KEYS.filter((key) => getChannelContent(key, channel)).map((key) => ({
    key,
    template: templates?.find((t) => t.event === key),
  }));

  if (!templates || templates.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">Nothing editable found.</div>;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{channel === 'whatsapp' ? 'Message' : 'Email'}</TableHead>
            <TableHead>{readOnly ? 'Template' : 'Wording'}</TableHead>
            <TableHead>Sending</TableHead>
            <TableHead className="w-[200px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ key, template }) => {
            const definition = EVENT_REGISTRY[key];
            const editedCount = Object.keys(template?.overrides ?? {}).length;
            return (
              <TableRow key={key}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <IconBox color="blue" size="sm">
                      {channel === 'whatsapp' ? (
                        <MessageCircle className="h-5 w-5" />
                      ) : (
                        <Mail className="h-5 w-5" />
                      )}
                    </IconBox>
                    <div>
                      <div className="font-medium">{definition.displayName}</div>
                      <div className="text-xs text-muted-foreground max-w-md">
                        {definition.description}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {readOnly ? (
                    <div className="text-xs text-muted-foreground">
                      <div>
                        Approved template <code>{definition.templateName}</code>, set in code
                      </div>
                      <div>
                        Parameters in order:{' '}
                        {definition.whatsapp?.parameterOrder
                          ?.map((name) => `{{${name}}}`)
                          .join(', ')}
                      </div>
                    </div>
                  ) : (
                    <Badge variant={editedCount > 0 ? 'default' : 'secondary'}>
                      {editedCount > 0
                        ? `${editedCount} ${editedCount === 1 ? 'field' : 'fields'} edited`
                        : 'Default'}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {getToggleableChannels(key).includes(channel) ? (
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={template?.is_active !== false}
                        disabled={!canManage || !template || setEnabled.isPending}
                        onCheckedChange={(enabled) => setEnabled.mutate({ event: key, channel, enabled })}
                        aria-label={`Send ${definition.displayName} by ${channel === 'whatsapp' ? 'WhatsApp' : 'email'}`}
                      />
                      <span className="text-xs text-muted-foreground">
                        {template?.is_active !== false ? 'On' : 'Off'}
                      </span>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      Channels are set per step in{' '}
                      <Link href="/settings/reminders#schedule" className="underline">
                        Reminder Schedule
                      </Link>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {template && !readOnly && (
                    <div className="flex justify-end gap-2">
                      {onPreview && (
                        <Button variant="outline" size="sm" onClick={() => onPreview(template)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Preview
                        </Button>
                      )}
                      {canManage && onEdit && (
                        <Button size="sm" onClick={() => onEdit(template)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </Button>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
