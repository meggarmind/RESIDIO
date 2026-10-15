'use client';

import { Loader2 } from 'lucide-react';
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
import { useDeleteImport } from '@/hooks/use-imports';

/** Statuses `deleteImport` accepts (src/actions/imports/create-import.ts). */
const DELETABLE_STATUSES = ['pending', 'failed', 'rejected'];

export function canDeleteImport(status: string | null | undefined): boolean {
  return !!status && DELETABLE_STATUSES.includes(status);
}

interface DeleteImportDialogProps {
  importId: string;
  fileName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the server confirms the delete. */
  onDeleted?: () => void;
}

export function DeleteImportDialog({
  importId,
  fileName,
  open,
  onOpenChange,
  onDeleted,
}: DeleteImportDialogProps) {
  const deleteMutation = useDeleteImport();

  const handleDelete = (e: React.MouseEvent) => {
    // Keep the dialog open until the server answers.
    e.preventDefault();
    deleteMutation.mutate(importId, {
      onSuccess: () => {
        onOpenChange(false);
        onDeleted?.();
      },
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete import</AlertDialogTitle>
          <AlertDialogDescription>
            Delete &quot;{fileName}&quot; and all of its rows? No payments were created from it.
            This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
