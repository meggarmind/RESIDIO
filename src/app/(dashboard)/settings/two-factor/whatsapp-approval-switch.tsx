'use client';

import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSetWhatsAppSignInApproval, useWhatsAppSignInApproval } from '@/hooks/use-two-factor';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';

/**
 * "Approve sign-ins on WhatsApp" (#1389). Shown only when two-factor login is on and a WhatsApp
 * number is linked (the read action says so), because only then can it be saved.
 */
export function WhatsAppApprovalSwitch() {
  const approval = useWhatsAppSignInApproval();
  const save = useSetWhatsAppSignInApproval();
  const { hasPermission } = useAuth();

  // The read and the save both need two_factor.enable (CORE §6: the client check names the server's permission).
  if (!hasPermission(PERMISSIONS.TWO_FACTOR_ENABLE)) return null;
  if (approval.isLoading) return null;
  if (approval.error) {
    return <p className="text-sm text-destructive">{approval.error.message}</p>;
  }
  if (!approval.data?.available) return null;

  return (
    <div className="flex items-start justify-between gap-4 rounded-md border p-4">
      <div className="space-y-1">
        <Label htmlFor="two-factor-whatsapp-approval">Approve sign-ins on WhatsApp</Label>
        <p className="text-sm text-muted-foreground">
          After your password, tap a number in WhatsApp instead of typing a code. Your authenticator app still works.
        </p>
      </div>
      <Switch
        id="two-factor-whatsapp-approval"
        checked={approval.data.enabled}
        disabled={save.isPending}
        onCheckedChange={(enabled) =>
          save.mutate(enabled, {
            onSuccess: (result) => toast.success(result.message),
            onError: (error) => toast.error(error.message),
          })
        }
      />
    </div>
  );
}
