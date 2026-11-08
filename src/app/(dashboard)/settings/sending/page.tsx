'use client';

import { EmailDeliverySections } from '@/components/settings/messages/email-delivery-sections';
import { SmsProviderSection } from '@/components/settings/messages/sms-provider-section';
import { TestingSection } from '@/components/settings/messages/testing-section';
import { SettingsMergedPage } from '@/components/settings/settings-merged-page';

export default function SendingPage() {
  return (
    <SettingsMergedPage>
      <EmailDeliverySections />
      <SmsProviderSection />
      <TestingSection />
    </SettingsMergedPage>
  );
}
