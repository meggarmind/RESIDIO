'use client';

import * as React from 'react';
import { AlertTriangle, Check, ChevronDown, Loader2, Save, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconBox } from '@/components/ui/icon-box';
import { useAuth } from '@/lib/auth/auth-provider';
import type { Permission } from '@/lib/auth/action-roles';
import { cn } from '@/lib/utils';
import { isSectionShown, SectionSummaryCard, useOptionalSettingsSections } from '@/components/settings/settings-sections-provider';

interface SettingsSectionProps {
  /** Anchor id. Must match the registry section id. */
  id: string;
  title: string;
  /** One line of the current values, shown while collapsed too. */
  summary: React.ReactNode;
  description?: string;
  icon?: LucideIcon;
  /** Holding any one reveals the section. Renders nothing otherwise. */
  permissions?: Permission[];
  defaultCollapsed?: boolean;
  /**
   * The section's controls act the moment they are used (a switch, a table with its own
   * dialogs), so there is nothing to save: no footer, no dirty state (decision 7, #791).
   */
  instant?: boolean;
  /** Marks the section as risky (a redirect is on): amber border and a "Needs attention" tag. */
  warning?: boolean;
  isDirty?: boolean;
  isSaving?: boolean;
  canSave?: boolean;
  /** Said in the footer when Save is blocked. */
  saveBlockedReason?: string;
  /** Return false (or throw) when the save failed, so the footer does not claim "Saved". */
  onSave?: () => unknown;
  onDiscard?: () => void;
  children: React.ReactNode;
}

export function SettingsSection({
  id,
  title,
  summary,
  description,
  icon: Icon,
  permissions,
  defaultCollapsed = false,
  instant = false,
  warning = false,
  isDirty = false,
  isSaving = false,
  canSave = true,
  saveBlockedReason,
  onSave,
  onDiscard,
  children,
}: SettingsSectionProps) {
  const { isLoading, hasAnyPermission } = useAuth();
  // Same rule as use-settings-navigation: show while permissions load, so nothing flashes in.
  const visible = !permissions || isLoading || hasAnyPermission(permissions);
  const page = useOptionalSettingsSections();
  const [open, setOpen] = React.useState(!defaultCollapsed);
  const [saved, setSaved] = React.useState(false);
  const onSaveRef = React.useRef(onSave ?? (() => true));
  React.useEffect(() => {
    onSaveRef.current = onSave ?? (() => true);
  });

  const save = React.useCallback(async () => {
    try {
      const result = await onSaveRef.current();
      if (result === false) return false;
      setSaved(true);
      return true;
    } catch (error) {
      console.error(`Saving settings section "${id}" failed`, error);
      return false;
    }
  }, [id]);

  React.useEffect(() => {
    if (isDirty) setSaved(false);
  }, [isDirty]);

  const register = page?.register;
  const unregister = page?.unregister;
  const setHandles = page?.setHandles;
  React.useEffect(() => {
    register?.({ id, title, dirty: isDirty, visible, canSave, saveBlockedReason });
  }, [register, id, title, isDirty, visible, canSave, saveBlockedReason]);
  React.useEffect(() => {
    setHandles?.(id, { save, setOpen });
  }, [setHandles, id, save]);
  React.useEffect(() => () => unregister?.(id), [unregister, id]);

  if (!visible) return null;

  const headingId = `${id}-heading`;
  const toggleId = `${id}-toggle`;
  const summaryId = `${id}-summary`;
  const bodyId = `${id}-body`;
  const blocked = isDirty && !canSave;
  const btn = 'min-h-11 md:min-h-9';

  return (
    <>
    <SectionSummaryCard id={id} title={title} summary={summary} dirty={isDirty} warning={warning} />
    <section
      id={id}
      aria-labelledby={headingId}
      // Hidden, not unmounted, on another tab (#1365): unsaved edits stay and the leave guard still sees them.
      hidden={!isSectionShown(page, id)}
      data-dirty={isDirty}
      className={cn(
        'scroll-mt-20 rounded-xl border bg-card shadow-sm',
        (isDirty || warning) && 'border-warning/30',
      )}
    >
      <div className="relative flex items-center gap-3.5 p-4 md:p-5">
        {Icon && (
          <IconBox color="cyan" size="sm" aria-hidden="true">
            <Icon className="h-5 w-5" />
          </IconBox>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={headingId} className="text-lg font-semibold leading-snug">
              <button
                id={toggleId}
                type="button"
                aria-expanded={open}
                aria-controls={bodyId}
                aria-describedby={summaryId}
                onClick={() => setOpen((o) => !o)}
                className="cursor-pointer text-left after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-[3px] focus-visible:after:ring-ring focus-visible:after:ring-inset"
              >
                {title}
              </button>
            </h2>
            {isDirty && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning">
                <span aria-hidden className="h-2 w-2 rounded-full bg-warning" />
                Unsaved
              </span>
            )}
            {warning && !isDirty && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning">
                <AlertTriangle aria-hidden className="h-3.5 w-3.5" />
                Needs attention
              </span>
            )}
          </div>
          <p id={summaryId} className="mt-0.5 text-sm text-muted-foreground">
            {summary}
          </p>
        </div>
        <ChevronDown
          aria-hidden
          className={cn('h-5 w-5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', !open && '-rotate-90')}
        />
      </div>

      <div id={bodyId} hidden={!open} className="border-t">
        {description && <p className="px-4 pt-4 text-sm text-muted-foreground md:px-5">{description}</p>}
        {isLoading ? null : children}
      </div>

      {!instant && open && (
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-2.5 rounded-b-xl border-t px-4 py-3 md:px-5',
            isDirty && 'bg-warning/10',
          )}
        >
          <div aria-live="polite" className="text-sm">
            {isDirty ? (
              <p className="flex items-center gap-2 font-medium text-warning">
                <span aria-hidden className="h-2 w-2 rounded-full bg-warning" />
                Unsaved changes
              </p>
            ) : saved ? (
              <p className="flex items-center gap-2 font-medium text-success">
                <Check aria-hidden className="h-4 w-4" />
                Saved
              </p>
            ) : (
              <p className="text-muted-foreground">No changes</p>
            )}
          </div>
          {blocked && saveBlockedReason && (
            <p className="w-full text-sm text-warning md:order-last">{saveBlockedReason}</p>
          )}
          <div className="flex w-full gap-2 md:ml-auto md:w-auto">
            <Button
              variant="outline"
              className={cn(btn, 'flex-1 md:flex-none')}
              onClick={onDiscard}
              disabled={!isDirty || isSaving}
            >
              Discard
            </Button>
            <Button
              className={cn(btn, 'flex-1 md:flex-none')}
              onClick={save}
              disabled={!isDirty || isSaving || !canSave}
            >
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save {title}
            </Button>
          </div>
        </div>
      )}
    </section>
    </>
  );
}
