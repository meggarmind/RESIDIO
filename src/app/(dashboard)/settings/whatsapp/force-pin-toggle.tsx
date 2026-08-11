'use client';

import { useState, useTransition } from 'react';
import { Switch } from '@/components/ui/switch';
import { setWhatsAppForcePin } from '@/actions/whatsapp/identity';

export function ForcePinToggle({ initialValue }: { initialValue: boolean }) {
  const [enabled, setEnabled] = useState(initialValue);
  const [isPending, startTransition] = useTransition();

  function handleChange(nextValue: boolean) {
    const previousValue = enabled;
    setEnabled(nextValue);
    startTransition(async () => {
      const result = await setWhatsAppForcePin(nextValue);
      if (!result.success) setEnabled(previousValue);
    });
  }

  return (
    <Switch
      checked={enabled}
      disabled={isPending}
      onCheckedChange={handleChange}
      aria-label="Require PIN for all WhatsApp financial answers"
    />
  );
}
