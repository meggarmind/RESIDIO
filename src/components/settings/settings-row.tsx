'use client';

import * as React from 'react';
import { findSettingsRow } from '@/config/settings-nav';
import { useOptionalSettingsSections } from './settings-sections-provider';

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
  children: React.ReactNode | ((ids: SettingsRowControlIds) => React.ReactNode);
}

/**
 * One setting. Label and help come from the registry (`settings-nav.ts`), so the page
 * cannot name a row differently from search. The row is focusable so a search hit can land on it.
 */
export function SettingsRow({ rowId, children }: SettingsRowProps) {
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
      className="grid gap-2.5 border-t px-4 py-4 transition-colors duration-500 first:border-t-0 focus:outline-none data-[hit=true]:bg-[oklch(0.7255_0.1686_192.1771/0.14)] data-[hit=true]:shadow-[inset_4px_0_0_oklch(0.7255_0.1686_192.1771)] md:grid-cols-2 md:items-start md:gap-6 md:px-5"
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
      <div className="flex min-w-0 flex-wrap items-center gap-2.5 md:justify-end [&_button]:min-h-11 md:[&_button]:min-h-0 [&_input]:min-h-11 md:[&_input]:min-h-0">
        {typeof children === 'function' ? children(ids) : children}
      </div>
    </div>
  );
}
