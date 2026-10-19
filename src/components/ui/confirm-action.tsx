'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type PreviewResult<T> = { data: T | null; error: string | null };

interface ConfirmActionProps<T> {
  /** The control that opens the dialog. Omit it and pass `open` to drive the dialog yourself. */
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** Read-only dry run, loaded each time the dialog opens. Confirm waits for it. */
  loadPreview?: () => Promise<PreviewResult<T>>;
  renderPreview?: (data: T) => React.ReactNode;
  /** A word the admin must type before the action can run. */
  confirmWord?: string;
  onConfirm: () => unknown;
}

/**
 * The one confirmation for actions that charge, delete, lock out or send (#790): the
 * action runs only from the confirm button, and cancel runs nothing.
 */
export function ConfirmAction<T>({
  trigger,
  open: controlledOpen,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  loadPreview,
  renderPreview,
  confirmWord,
  onConfirm,
}: ConfirmActionProps<T>) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const [preview, setPreview] = React.useState<PreviewResult<T> | null>(null);
  const [typed, setTyped] = React.useState('');
  const [running, setRunning] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTyped('');
    setPreview(null);
    if (!loadPreview) return;
    let cancelled = false;
    loadPreview()
      .then((result) => !cancelled && setPreview(result))
      .catch((err: unknown) => !cancelled && setPreview({ data: null, error: err instanceof Error ? err.message : 'Preview failed' }));
    return () => {
      cancelled = true;
    };
    // Reload only when the dialog opens; loadPreview is usually an inline arrow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const previewPending = !!loadPreview && preview === null;
  const previewFailed = !!preview?.error;
  const wordMissing = !!confirmWord && typed.trim() !== confirmWord;
  const blocked = previewPending || previewFailed || wordMissing || running;

  const handleConfirm = async () => {
    setRunning(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch {
      // The caller reports its own failure; keep the dialog open so the admin can retry or cancel.
    } finally {
      setRunning(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription asChild><div className="space-y-2">{description}</div></AlertDialogDescription>}
        </AlertDialogHeader>

        {loadPreview && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm" aria-live="polite">
            {previewPending && (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking what this will change...
              </span>
            )}
            {previewFailed && <span className="text-destructive">Could not load the preview: {preview?.error}</span>}
            {preview?.data != null && renderPreview?.(preview.data)}
          </div>
        )}

        {confirmWord && (
          <div className="space-y-2">
            <Label htmlFor="confirm-action-word">Type {confirmWord} to confirm</Label>
            <Input
              id="confirm-action-word"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={handleConfirm} disabled={blocked}>
            {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
