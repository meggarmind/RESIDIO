'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { saveWhatsAppAdminRoleGrid, type WhatsAppAdminGrantChange } from '@/actions/whatsapp/admin-settings';
import { WHATSAPP_ADMIN_ITEMS, type WhatsAppAdminRoleGridRole } from '@/lib/whatsapp/admin-settings';

const key = (roleId: string, permission: string) => `${roleId}|${permission}`;

/** Roles down the side, Admin tools items across the top (#1295). Saving asks first and lists what changes. */
export function RoleGrid({ roles }: { roles: WhatsAppAdminRoleGridRole[] }) {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  const saved = new Set(roles.flatMap((role) => role.granted.map((permission) => key(role.roleId, permission))));
  const [checked, setChecked] = useState(saved);
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  const changes: (WhatsAppAdminGrantChange & { roleName: string; itemLabel: string })[] = roles.flatMap((role) =>
    WHATSAPP_ADMIN_ITEMS.flatMap((item) => {
      const granted = checked.has(key(role.roleId, item.permission));
      return granted === saved.has(key(role.roleId, item.permission))
        ? []
        : [{ roleId: role.roleId, permission: item.permission, granted, roleName: role.name, itemLabel: item.label }];
    })
  );

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2">Role</th>
              {WHATSAPP_ADMIN_ITEMS.map((item) => <th key={item.permission} className="px-3 py-2 text-center">{item.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.roleId} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{role.name}</td>
                {WHATSAPP_ADMIN_ITEMS.map((item) => (
                  <td key={item.permission} className="px-3 py-2 text-center">
                    <Checkbox
                      checked={checked.has(key(role.roleId, item.permission))}
                      disabled={!canManage}
                      aria-label={`${role.name}: ${item.label}`}
                      onCheckedChange={(value) => setChecked((current) => {
                        const next = new Set(current);
                        if (value === true) next.add(key(role.roleId, item.permission));
                        else next.delete(key(role.roleId, item.permission));
                        return next;
                      })}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={!canManage || changes.length === 0} onClick={() => setConfirming(true)}>Save role access</Button>
        <Button type="button" size="sm" variant="outline" disabled={changes.length === 0} onClick={() => setChecked(new Set(saved))}>Reset</Button>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change who sees resident data in WhatsApp?</DialogTitle>
            <DialogDescription>These changes take effect on the admin&apos;s next WhatsApp message.</DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {changes.map((change) => (
              <li key={key(change.roleId, change.permission)}>
                {change.granted ? 'Give' : 'Remove'} <span className="font-medium">{change.itemLabel}</span> {change.granted ? 'to' : 'from'} {change.roleName}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button
              type="button"
              disabled={isPending}
              onClick={() => startTransition(async () => {
                const result = await saveWhatsAppAdminRoleGrid(changes.map(({ roleId, permission, granted }) => ({ roleId, permission, granted })));
                if (!result.success) toast.error(result.error || 'Failed to save the role access');
                else {
                  toast.success('Role access saved');
                  setConfirming(false);
                  router.refresh();
                }
              })}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
