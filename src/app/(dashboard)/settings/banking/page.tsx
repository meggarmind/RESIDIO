'use client';

import { ApprovalLimitSection } from '@/components/settings/banking/approval-limit-section';
import { BankAccountsSection } from '@/components/settings/banking/bank-accounts-section';
import { DuplicateMatchingSection } from '@/components/settings/banking/duplicate-matching-section';
import { TransactionTagsSection } from '@/components/settings/banking/transaction-tags-section';
import { SettingsMergedPage } from '@/components/settings/settings-merged-page';

export default function BankingPage() {
  return (
    <SettingsMergedPage>
      <BankAccountsSection />
      <TransactionTagsSection />
      <DuplicateMatchingSection />
      <ApprovalLimitSection />
    </SettingsMergedPage>
  );
}
