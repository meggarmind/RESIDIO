import type { ReactNode } from 'react';
import { SettingEffect } from '@/components/settings/setting-effect';

/** A control with its "Affects:" line (#790) underneath, inside a SettingsRow's control column. */
export function ControlWithEffect({ effect, children }: { effect: ReactNode; children: ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-1.5 md:items-end">
      {children}
      <SettingEffect>{effect}</SettingEffect>
    </div>
  );
}
