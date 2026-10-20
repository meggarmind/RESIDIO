'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { setWhatsAppPrivacyNotice } from '@/actions/whatsapp/identity';

export function PrivacyNoticeSettings({ initial }: { initial: { version: string; text: string } }) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.WHATSAPP_MANAGE);
  const [version, setVersion] = useState(initial.version);
  const [text, setText] = useState(initial.text);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await setWhatsAppPrivacyNotice({ version, text });
      if (!result.success) toast.error(result.error || 'Failed to save the WhatsApp privacy notice');
      else toast.success(result.data?.version !== initial.version ? 'Notice saved. Residents will be asked to accept the new version.' : 'Notice saved');
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="privacy-notice-version">Version</Label>
        <Input id="privacy-notice-version" className="max-w-xs" value={version} disabled={!canManage || isPending} onChange={(event) => setVersion(event.target.value)} />
        <p className="text-xs text-muted-foreground">Changing the version asks every resident to accept the notice again. Change it whenever you change the text.</p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="privacy-notice-text">Notice text</Label>
        <Textarea id="privacy-notice-text" rows={8} value={text} disabled={!canManage || isPending} onChange={(event) => setText(event.target.value)} />
        <p className="text-xs text-muted-foreground">Sent to residents as a PDF before the assistant uses their records. Needs exco sign-off before launch.</p>
      </div>
      {canManage ? <Button size="sm" disabled={isPending || !version.trim() || !text.trim()} onClick={handleSave}>Save notice</Button> : null}
    </div>
  );
}
