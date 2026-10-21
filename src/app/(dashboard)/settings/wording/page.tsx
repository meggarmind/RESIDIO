'use client';

import { WordingSections } from '@/components/settings/messages/email-wording-section';
import { SettingsMergedPage } from '@/components/settings/settings-merged-page';

export default function WordingPage() {
  return (
    <SettingsMergedPage>
      <WordingSections />
    </SettingsMergedPage>
  );
}
