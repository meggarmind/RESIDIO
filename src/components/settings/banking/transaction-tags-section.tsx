'use client';

import { TransactionTagsList } from '@/components/admin/transaction-tags-list';
import { useTransactionTags } from '@/hooks/use-reference';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';

/** Transaction tags of Banking (from the old Transaction Tags page). The list has its own dialogs. */
export function TransactionTagsSection() {
  // The list's own query (same key), so this adds no request.
  const { data, isLoading } = useTransactionTags({ include_inactive: true });
  const count = data?.length ?? 0;

  return (
    <SettingsSection
      id="tags"
      title="Transaction tags"
      summary={isLoading ? 'Loading tags' : `${count} ${count === 1 ? 'tag' : 'tags'}`}
      permissions={[PERMISSIONS.SETTINGS_MANAGE_REFERENCE]}
      defaultCollapsed
      instant
    >
      <SettingsRow rowId="transaction-tags" stacked>
        <div className="w-full">
          <TransactionTagsList />
        </div>
      </SettingsRow>
    </SettingsSection>
  );
}
