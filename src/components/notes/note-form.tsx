'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import type {
  NoteCategory,
  NoteEntityType,
  EntityNoteWithRelations,
  CreateNoteInput,
  UpdateNoteInput,
} from '@/types/database';
import { NOTE_CATEGORY_LABELS } from '@/types/database';
import { useCreateNote, useUpdateNote } from '@/hooks/use-notes';
import { useDocuments } from '@/hooks/use-documents';
import { toast } from 'sonner';

const noteFormSchema = z.object({
  title: z.string().max(200).optional(),
  content: z.string().min(1, 'Content is required').max(10000),
  category: z.enum([
    'general',
    'agreement',
    'complaint',
    'reminder',
    'financial',
    'security',
    'maintenance',
    'legal',
  ] as const),
  is_confidential: z.boolean(),
  confidential_roles: z.array(z.string()).optional(),
  document_id: z.string().uuid().nullable().optional(),
});

type NoteFormValues = z.infer<typeof noteFormSchema>;

interface NoteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: NoteEntityType;
  entityId: string;
  note?: EntityNoteWithRelations; // For editing
  onSuccess?: () => void;
}

export function NoteFormDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  note,
  onSuccess,
}: NoteFormDialogProps) {
  const isEditing = !!note;
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();

  // Fetch documents for the linked document dropdown
  const { data: documentsData } = useDocuments({
    is_archived: false,
    limit: 100,
  });

  const form = useForm<NoteFormValues>({
    resolver: zodResolver(noteFormSchema),
    defaultValues: {
      title: note?.title || '',
      content: note?.content || '',
      category: (note?.category as NoteCategory) || 'general',
      is_confidential: note?.is_confidential || false,
      confidential_roles: note?.confidential_roles || [],
      document_id: note?.document_id || null,
    },
  });

  const isLoading = createNote.isPending || updateNote.isPending;

  async function onSubmit(values: NoteFormValues) {
    try {
      if (isEditing && note) {
        const updateInput: UpdateNoteInput = {
          title: values.title || undefined,
          content: values.content,
          category: values.category,
          is_confidential: values.is_confidential,
          confidential_roles: values.is_confidential
            ? values.confidential_roles
            : undefined,
          document_id: values.document_id || undefined,
        };
        await updateNote.mutateAsync({ id: note.id, data: updateInput });
        toast.success('Note updated successfully');
      } else {
        const createInput: CreateNoteInput = {
          entity_type: entityType,
          entity_id: entityId,
          title: values.title || undefined,
          content: values.content,
          category: values.category,
          is_confidential: values.is_confidential,
          confidential_roles: values.is_confidential
            ? values.confidential_roles
            : undefined,
          document_id: values.document_id || undefined,
        };
        await createNote.mutateAsync(createInput);
        toast.success('Note created successfully');
      }
      form.reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error(
        isEditing ? 'Failed to update note' : 'Failed to create note'
      );
      console.error('Note form error:', error);
    }
  }

  const categories = Object.entries(NOTE_CATEGORY_LABELS) as [
    NoteCategory,
    string
  ][];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Note' : 'Add Note'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update this note. A new version will be created to preserve history.'
              : `Add a note to this ${entityType}.`}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Give your note a title..."
                      {...field}
                      value={field.value || ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Content</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Write your note here..."
                      className="min-h-[150px] resize-y"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
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
                name="document_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Linked Document</FormLabel>
                    <Select
                      onValueChange={(value) =>
                        field.onChange(value === 'none' ? null : value)
                      }
                      defaultValue={field.value || 'none'}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="No document" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No document</SelectItem>
                        {documentsData?.data?.map((doc) => (
                          <SelectItem key={doc.id} value={doc.id}>
                            {doc.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Optionally attach a document
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="is_confidential"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Confidential</FormLabel>
                    <FormDescription>
                      Mark this note as confidential (restricted visibility)
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Save Changes' : 'Create Note'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
