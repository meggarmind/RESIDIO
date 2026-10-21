'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { findSettingsRow } from '@/config/settings-nav';
import { useOptionalSettingsSections } from '@/components/settings/settings-sections-provider';

export interface SettingsRowControlIds {
  /** Put on the control so the label names it. */
  controlId: string;
  /** For `aria-labelledby` on controls that are not inputs. */
  labelId: string;
  /** For `aria-describedby`. Undefined when the row has no help text. */
  helpId?: string;
}

interface SettingsRowProps {
  rowId: string;
  /** Label above the control, full width: for a table or a list that cannot sit beside its label. */
  stacked?: boolean;
  children: React.ReactNode | ((ids: SettingsRowControlIds) => React.ReactNode);
}

/**
 * One setting. Label and help come from the registry (`settings-nav.ts`), so the page
 * cannot name a row differently from search. The row is focusable so a search hit can land on it.
 */
export function SettingsRow({ rowId, stacked = false, children }: SettingsRowProps) {
  const groups = useOptionalSettingsSections()?.groups;
  const match = findSettingsRow(rowId, groups);
  if (!match && process.env.NODE_ENV !== 'production') {
    throw new Error(`SettingsRow: "${rowId}" is not in the settings registry (src/config/settings-nav.ts).`);
  }
  const label = match?.row.label ?? rowId;
  const help = match?.row.help;
  const ids: SettingsRowControlIds = {
    controlId: `${rowId}-control`,
    labelId: `${rowId}-label`,
    helpId: help ? `${rowId}-help` : undefined,
  };

  return (
    <div
      id={rowId}
      tabIndex={-1}
      role="group"
      aria-labelledby={ids.labelId}
      aria-describedby={ids.helpId}
      className={cn(
        'grid gap-2.5 border-t px-4 py-4 transition-colors duration-500 motion-reduce:transition-none first:border-t-0 focus:outline-none data-[hit=true]:bg-info/10 data-[hit=true]:shadow-[inset_4px_0_0_var(--info)] md:items-start md:gap-6 md:px-5',
        !stacked && 'md:grid-cols-2',
      )}
    >
      <div>
        <label id={ids.labelId} htmlFor={ids.controlId} className="block font-medium">
          {label}
        </label>
        {help && (
          <p id={ids.helpId} className="mt-0.5 max-w-[52ch] text-sm text-muted-foreground">
            {help}
          </p>
        )}
      </div>
      <div className={cn('flex min-w-0 flex-wrap items-center gap-2.5 [&_:is(button,input,select,textarea,[role=switch])]:min-h-11 md:[&_:is(button,input,select,textarea,[role=switch])]:min-h-0', !stacked && 'md:justify-end')}>
        {typeof children === 'function' ? children(ids) : children}
      </div>
    </div>
  );
}
