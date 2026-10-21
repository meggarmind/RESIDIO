'use client';

import { BankAccountsList } from '@/components/admin/bank-accounts-list';
import { BankPasswordsSection } from '@/components/admin/bank-passwords-section';
import { useBankAccounts } from '@/hooks/use-imports';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';

/** Bank accounts of Banking (from the old Bank Accounts page). The list and the passwords have their own dialogs, so nothing here waits for a Save. */
export function BankAccountsSection() {
  const { data, isLoading } = useBankAccounts();
  const count = data?.data?.length ?? 0;

  return (
    <SettingsSection
      id="bank-accounts"
      title="Bank accounts"
      summary={isLoading ? 'Loading bank accounts' : `${count} active ${count === 1 ? 'account' : 'accounts'}`}
      permissions={[PERMISSIONS.SETTINGS_MANAGE_REFERENCE]}
      instant
    >
      <SettingsRow rowId="estate-bank-accounts" stacked>
        <div className="w-full">
          <BankAccountsList />
        </div>
      </SettingsRow>
      <SettingsRow rowId="statement-passwords" stacked>
        <BankPasswordsSection />
      </SettingsRow>
    </SettingsSection>
  );
}
