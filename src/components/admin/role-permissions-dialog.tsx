'use client';

import { useState, useMemo } from 'react';
import { usePermissions, useUpdateRolePermissions } from '@/hooks/use-roles';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Shield } from 'lucide-react';
import { PermissionPicker } from './permission-picker';
import type { AppRoleWithPermissions } from '@/types/database';

interface RolePermissionsDialogProps {
  role: AppRoleWithPermissions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Edits what an existing role can do.
 *
 * The picker itself lives in `PermissionPicker`, shared with the create flow —
 * this is only the dialog shell, the initial selection and the save.
 */
export function RolePermissionsDialog({
  role,
  open,
  onOpenChange,
}: RolePermissionsDialogProps) {
  const { data: allPermissions, isLoading } = usePermissions();
  const updatePermissionsMutation = useUpdateRolePermissions();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Seed the selection from the role each time the dialog opens, adjusting
  // state during render rather than in an effect. Keying on open (not just the
  // role) also discards edits abandoned with Cancel, so reopening starts from
  // what is actually saved.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const openKey = open ? role.id : null;
  if (openKey !== seededFor) {
    setSeededFor(openKey);
    if (openKey) setSelectedIds(new Set(role.permissions.map((p) => p.id)));
  }

  const hasChanges = useMemo(() => {
    const original = new Set(role.permissions.map((p) => p.id));
    if (original.size !== selectedIds.size) return true;
    for (const id of selectedIds) if (!original.has(id)) return true;
    return false;
  }, [role.permissions, selectedIds]);

  const handleSave = async () => {
    await updatePermissionsMutation.mutateAsync({
      roleId: role.id,
      permissionIds: Array.from(selectedIds),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Manage access
          </DialogTitle>
          <DialogDescription>
            Choose what <strong>{role.display_name}</strong> can do. Tick a module to grant all
            of it, or open a module to pick individual privileges. Changes take effect after
            users log in again.
          </DialogDescription>
        </DialogHeader>

        <PermissionPicker
          permissions={allPermissions}
          isLoading={isLoading}
          value={selectedIds}
          onChange={setSelectedIds}
        />

        <DialogFooter className="flex items-center justify-between border-t pt-4">
          <div className="text-sm text-muted-foreground">
            {selectedIds.size} privilege{selectedIds.size !== 1 ? 's' : ''} granted
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || updatePermissionsMutation.isPending}
            >
              {updatePermissionsMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
