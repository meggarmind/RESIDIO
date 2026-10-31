'use client';

import { Suspense, type ReactNode } from 'react';
import { SettingsPageHeader } from '@/components/settings/settings-page-header';
import { SettingsPageNav } from '@/components/settings/settings-page-nav';
import { SettingsSectionsProvider } from '@/components/settings/settings-sections-provider';

/**
 * Frame for a task page made of stacked sections (#791): header, sticky "On this page" chips and
 * the section provider (leave guard, #hash and ?row= handling). Suspense is for the provider's
 * `useSearchParams`. Pages outside Settings pass their own `title`, as the menu lookup is Settings-only.
 */
export function SettingsMergedPage({
  title,
  description,
  actions,
  children,
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <SettingsSectionsProvider>
        <div className="space-y-4">
          <SettingsPageHeader title={title} description={description} actions={actions} />
          <SettingsPageNav />
          <div className="space-y-4">{children}</div>
        </div>
      </SettingsSectionsProvider>
    </Suspense>
  );
}
