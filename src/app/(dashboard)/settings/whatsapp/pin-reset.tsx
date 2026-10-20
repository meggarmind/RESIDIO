'use client';

import { CodeAction } from '@/app/(dashboard)/settings/whatsapp/issue-code';
import { resetWhatsAppPin } from '@/actions/whatsapp/identity';

export function PinReset({ residentId, residentName }: { residentId: string; residentName: string }) {
  return (
    <CodeAction
      label="Reset PIN"
      title="Reset WhatsApp PIN"
      description={`This clears the PIN and any lock for ${residentName}, signs open WhatsApp chats out of the PIN, and issues a PIN setup code valid for 10 minutes. Whoever holds the code can set the new PIN.`}
      codeTitle="Setup code for the new PIN"
      codeHint="Give this code to the resident. They send PIN on WhatsApp and enter it when asked for the setup code."
      run={() => resetWhatsAppPin(residentId)}
    />
  );
}
