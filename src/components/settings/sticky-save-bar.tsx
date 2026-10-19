'use client';

import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StickySaveBarProps {
  isDirty: boolean;
  isSaving: boolean;
  canSave?: boolean;
  onSave: () => void;
  onDiscard: () => void;
}

/** Keeps a page's Save in reach while it has unsaved changes (#790). */
export function StickySaveBar({ isDirty, isSaving, canSave = true, onSave, onDiscard }: StickySaveBarProps) {
  if (!isDirty) return null;
  // fixed, not sticky: the dashboard <main> never scrolls itself, the window does.
  return (
    <>
      <div aria-hidden className="h-20" />
      <div
        role="region"
        aria-label="Unsaved changes"
        className="fixed inset-x-0 bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      >
        <p className="text-sm text-muted-foreground">
          {canSave ? 'You have unsaved changes.' : 'Fix the highlighted fields before saving.'}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onDiscard} disabled={isSaving}>
            Discard
          </Button>
          <Button onClick={onSave} disabled={!canSave || isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save changes
          </Button>
        </div>
      </div>
    </>
  );
}
