'use client';

/**
 * Notification Template List Component
 *
 * Displays a table of notification templates with actions.
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
import { Input } from '@/components/ui/input';
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Copy,
  Power,
  PowerOff,
  Eye,
  Lock,
  Mail,
  MessageSquare,
  Bell,
} from 'lucide-react';
import {
  useNotificationTemplates,
  useDeleteTemplate,
  useToggleTemplateActive,
  useDuplicateTemplate,
} from '@/hooks/use-notifications';
import {
  NOTIFICATION_CATEGORY_LABELS,
  NOTIFICATION_CHANNEL_LABELS,
} from '@/lib/notifications/types';
import type { NotificationTemplate, NotificationCategory, NotificationChannel } from '@/lib/notifications/types';

interface TemplateListProps {
  onEdit?: (template: NotificationTemplate) => void;
  onPreview?: (template: NotificationTemplate) => void;
}

export function TemplateList({ onEdit, onPreview }: TemplateListProps) {
  const { data: templates, isLoading } = useNotificationTemplates();
  const deleteTemplate = useDeleteTemplate();
  const toggleActive = useToggleTemplateActive();
  const duplicateTemplate = useDuplicateTemplate();

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [duplicateDialog, setDuplicateDialog] = useState<{ id: string; name: string } | null>(null);
  const [newName, setNewName] = useState('');

  const handleDelete = async () => {
    if (deleteId) {
      await deleteTemplate.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  const handleDuplicate = async () => {
    if (duplicateDialog && newName) {
      await duplicateTemplate.mutateAsync({ id: duplicateDialog.id, newName });
      setDuplicateDialog(null);
      setNewName('');
    }
  };

  const getChannelIcon = (channel: NotificationChannel) => {
    switch (channel) {
      case 'email':
        return <Mail className="h-4 w-4" />;
      case 'sms':
        return <MessageSquare className="h-4 w-4" />;
      case 'whatsapp':
        return <Bell className="h-4 w-4" />;
    }
  };

  const getCategoryColor = (category: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (category) {
      case 'payment':
        return 'default';
      case 'invoice':
        return 'secondary';
      case 'security':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading templates...</div>;
  }

  if (!templates || templates.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No templates found. Create your first template to get started.
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
              <TableHead>Category</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Variables</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((template) => (
              <TableRow key={template.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {template.is_system && (
                      <span title="System template">
                        <Lock className="h-3 w-3 text-muted-foreground" />
                      </span>
                    )}
                    <div>
                      <div className="font-medium">{template.display_name}</div>
                      <div className="text-xs text-muted-foreground">{template.name}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={getCategoryColor(template.category)}>
                    {NOTIFICATION_CATEGORY_LABELS[template.category as NotificationCategory]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {getChannelIcon(template.channel as NotificationChannel)}
                    <span className="text-sm">
                      {NOTIFICATION_CHANNEL_LABELS[template.channel as NotificationChannel]}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {template.variables?.length || 0} variables
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={template.is_active ? 'default' : 'secondary'}>
                    {template.is_active ? 'Active' : 'Inactive'}
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
                      {onPreview && (
                        <DropdownMenuItem onClick={() => onPreview(template)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Preview
                        </DropdownMenuItem>
                      )}
                      {onEdit && !template.is_system && (
                        <DropdownMenuItem onClick={() => onEdit(template)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => {
                          setDuplicateDialog({ id: template.id, name: template.name });
                          setNewName(`${template.name}_copy`);
                        }}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleActive.mutate(template.id)}>
                        {template.is_active ? (
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
                      {!template.is_system && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => setDeleteId(template.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
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
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this template? This action cannot be undone.
              Any schedules using this template will be affected.
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

      {/* Duplicate Dialog */}
      <AlertDialog open={!!duplicateDialog} onOpenChange={() => setDuplicateDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate Template</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a unique name for the new template.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New template name"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDuplicate} disabled={!newName}>
              Duplicate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
