'use client';

/**
 * Notification Template List Component
 *
 * Lists the resident emails whose wording an admin can edit (#907). The set is fixed by the
 * event registry, so there is nothing to create, duplicate or delete here.
 */

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
import { IconBox } from '@/components/ui/icon-box';
import { Eye, Mail, Pencil } from 'lucide-react';
import { useNotificationTemplates } from '@/hooks/use-notifications';
import { EVENT_KEYS, EVENT_REGISTRY } from '@/lib/notifications/event-content-registry';
import type { NotificationTemplate } from '@/lib/notifications/types';

interface TemplateListProps {
  /** Edit controls show only when the viewer holds notifications.manage. */
  canManage: boolean;
  onEdit?: (template: NotificationTemplate) => void;
  onPreview?: (template: NotificationTemplate) => void;
}

export function TemplateList({ canManage, onEdit, onPreview }: TemplateListProps) {
  const { data: templates, isLoading } = useNotificationTemplates({ channel: 'email' });

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading emails...</div>;
  }

  const rows = EVENT_KEYS.map((key) => ({
    key,
    template: templates?.find((t) => t.event === key),
  }));

  if (!templates || templates.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No editable emails found.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Wording</TableHead>
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
                      <Mail className="h-5 w-5" />
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
                  <Badge variant={editedCount > 0 ? 'default' : 'secondary'}>
                    {editedCount > 0
                      ? `${editedCount} ${editedCount === 1 ? 'field' : 'fields'} edited`
                      : 'Default'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {template && (
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
