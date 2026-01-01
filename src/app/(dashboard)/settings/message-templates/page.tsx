'use client';

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  useAllMessageTemplates,
  useCreateMessageTemplate,
  useUpdateMessageTemplate,
  useDeleteMessageTemplate,
  useAnnouncementCategories,
} from '@/hooks/use-announcements';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { Plus, Pencil, Trash2, FileText, X, Variable } from 'lucide-react';
import { toast } from 'sonner';
import type { MessageTemplateWithCategory } from '@/types/database';

const variableSchema = z.object({
  name: z.string().min(1, 'Variable name is required'),
  description: z.string().optional(),
  required: z.boolean(),
});

const templateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
  title_template: z.string().min(1, 'Title template is required').max(200, 'Title is too long'),
  content_template: z.string().min(1, 'Content template is required'),
  category_id: z.string().optional(),
  variables: z.array(variableSchema),
  is_active: z.boolean(),
});

type TemplateFormData = z.infer<typeof templateSchema>;

export default function MessageTemplatesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplateWithCategory | null>(null);
  const [deleteTemplate, setDeleteTemplate] = useState<MessageTemplateWithCategory | null>(null);

  const { data: templates = [], isLoading, refetch } = useAllMessageTemplates();
  const { data: categories = [] } = useAnnouncementCategories();
  const createMutation = useCreateMessageTemplate();
  const updateMutation = useUpdateMessageTemplate();
  const deleteMutation = useDeleteMessageTemplate();

  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.ANNOUNCEMENTS_MANAGE_TEMPLATES);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    control,
    formState: { errors },
  } = useForm<TemplateFormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: '',
      title_template: '',
      content_template: '',
      category_id: '',
      variables: [],
      is_active: true,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'variables',
  });

  const watchCategoryId = watch('category_id');
  const isActive = watch('is_active');

  const handleOpenDialog = (template?: MessageTemplateWithCategory) => {
    if (template) {
      setEditingTemplate(template);
      reset({
        name: template.name,
        title_template: template.title_template,
        content_template: template.content_template,
        category_id: template.category_id ?? '',
        variables: template.variables || [],
        is_active: template.is_active ?? true,
      });
    } else {
      setEditingTemplate(null);
      reset({
        name: '',
        title_template: '',
        content_template: '',
        category_id: '',
        variables: [],
        is_active: true,
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingTemplate(null);
    reset();
  };

  const addVariable = () => {
    append({ name: '', description: '', required: false });
  };

  const onSubmit = async (data: TemplateFormData) => {
    try {
      // Filter out empty variables
      const cleanedVariables = data.variables.filter((v) => v.name.trim() !== '');

      if (editingTemplate) {
        await updateMutation.mutateAsync({
          id: editingTemplate.id,
          data: {
            name: data.name,
            title_template: data.title_template,
            content_template: data.content_template,
            category_id: data.category_id || null,
            variables: cleanedVariables,
            is_active: data.is_active,
          },
        });
        toast.success('Template updated');
      } else {
        await createMutation.mutateAsync({
          name: data.name,
          title_template: data.title_template,
          content_template: data.content_template,
          category_id: data.category_id || undefined,
          variables: cleanedVariables,
        });
        toast.success('Template created');
      }
      handleCloseDialog();
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Operation failed');
    }
  };

  const handleDelete = async () => {
    if (!deleteTemplate) return;

    try {
      await deleteMutation.mutateAsync(deleteTemplate.id);
      toast.success('Template deleted');
      setDeleteTemplate(null);
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete template');
    }
  };

  if (!canManage) {
    return (
      <div className="text-center py-12">
        <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">
          You don&apos;t have permission to manage message templates.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Message Templates</h1>
          <p className="text-muted-foreground">
            Create reusable templates for common announcements.
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Template
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Templates</CardTitle>
          <CardDescription>
            Templates can include variables like {"{{name}}"} that get replaced when creating
            announcements. Use templates for recurring messages like monthly updates or event
            notifications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No templates yet</p>
              <Button className="mt-4" onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Template
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Title Template</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Variables</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id} className={!template.is_active ? 'opacity-50' : ''}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{template.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">
                      {template.title_template}
                    </TableCell>
                    <TableCell>
                      {template.category ? (
                        <Badge variant="outline">{template.category.name}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {template.variables && template.variables.length > 0 ? (
                        <div className="flex items-center gap-1">
                          <Variable className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{template.variables.length}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {template.is_active ? (
                        <Badge
                          variant="secondary"
                          className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        >
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(template)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTemplate(template)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Template' : 'Create Template'}</DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? 'Update the template details below.'
                : 'Create a reusable template for announcements. Use {{variableName}} syntax for dynamic content.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name *</Label>
              <Input
                id="name"
                {...register('name')}
                placeholder="e.g., Monthly Update Template"
              />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="category_id">Category</Label>
              <Select
                value={watchCategoryId || 'none'}
                onValueChange={(value) => setValue('category_id', value === 'none' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Category</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title_template">Title Template *</Label>
              <Input
                id="title_template"
                {...register('title_template')}
                placeholder="e.g., {{month}} Community Update"
              />
              <p className="text-xs text-muted-foreground">
                Use {"{{variableName}}"} for dynamic content.
              </p>
              {errors.title_template && (
                <p className="text-sm text-destructive">{errors.title_template.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="content_template">Content Template *</Label>
              <Textarea
                id="content_template"
                {...register('content_template')}
                placeholder="Dear residents,&#10;&#10;Here is the {{month}} update for our community...&#10;&#10;{{content}}"
                rows={8}
              />
              {errors.content_template && (
                <p className="text-sm text-destructive">{errors.content_template.message}</p>
              )}
            </div>

            {/* Variables Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Template Variables</Label>
                <Button type="button" variant="outline" size="sm" onClick={addVariable}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Variable
                </Button>
              </div>

              {fields.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No variables defined. Variables allow you to customize the template when creating
                  announcements.
                </p>
              ) : (
                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <div key={field.id} className="flex items-start gap-3 p-3 border rounded-lg">
                      <div className="flex-1 grid grid-cols-2 gap-3">
                        <div>
                          <Input
                            placeholder="Variable name"
                            {...register(`variables.${index}.name`)}
                          />
                          {errors.variables?.[index]?.name && (
                            <p className="text-xs text-destructive mt-1">
                              {errors.variables[index]?.name?.message}
                            </p>
                          )}
                        </div>
                        <Input
                          placeholder="Description (optional)"
                          {...register(`variables.${index}.description`)}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`required-${index}`}
                            checked={watch(`variables.${index}.required`)}
                            onCheckedChange={(checked) =>
                              setValue(`variables.${index}.required`, checked === true)
                            }
                          />
                          <label
                            htmlFor={`required-${index}`}
                            className="text-sm text-muted-foreground"
                          >
                            Required
                          </label>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(index)}
                          className="text-destructive hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {editingTemplate && (
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <Label htmlFor="is_active" className="font-medium">
                    Active
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Inactive templates won&apos;t appear in template selection.
                  </p>
                </div>
                <Switch
                  id="is_active"
                  checked={isActive}
                  onCheckedChange={(checked) => setValue('is_active', checked)}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? 'Saving...'
                  : editingTemplate
                    ? 'Update Template'
                    : 'Create Template'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTemplate}
        onOpenChange={(open) => !open && setDeleteTemplate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTemplate?.name}&quot;? This will
              deactivate the template. Existing announcements created from this template will not be
              affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
