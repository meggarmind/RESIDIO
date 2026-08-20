'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Shield, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  useSecurityRolePermissions,
  useUpdateSecurityRolePermissions,
} from '@/hooks/use-security';
import type { SecurityRolePermissions, UserRole } from '@/types/database';
import { SECURITY_PERMISSION_LABELS, USER_ROLE_LABELS, DEFAULT_SECURITY_PERMISSIONS } from '@/types/database';

const CONFIGURABLE_ROLES: UserRole[] = ['chairman', 'financial_secretary', 'security_officer'];

type PermissionKey = keyof SecurityRolePermissions;

export default function PermissionsPage() {
  const { data: rolePermissions, isLoading } = useSecurityRolePermissions();
  const updatePermissions = useUpdateSecurityRolePermissions();
  const [editingPermissions, setEditingPermissions] = useState<SecurityRolePermissions | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const handlePermissionToggle = (permission: PermissionKey, role: UserRole) => {
    if (!editingPermissions) return;

    const currentRoles = editingPermissions[permission] || [];
    const newRoles = currentRoles.includes(role)
      ? currentRoles.filter(r => r !== role)
      : [...currentRoles, role];

    setEditingPermissions({
      ...editingPermissions,
      [permission]: newRoles,
    });
  };

  const savePermissions = () => {
    if (!editingPermissions) return;
    updatePermissions.mutate(editingPermissions, {
      onSuccess: () => {
        setIsEditing(false);
        setEditingPermissions(null);
        toast.success('Permissions updated');
      },
    });
  };

  const permissionKeys = Object.keys(SECURITY_PERMISSION_LABELS) as PermissionKey[];
  const displayPermissions = editingPermissions || rolePermissions;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Role Permissions</h3>
          <p className="text-sm text-muted-foreground">
            Configure what each role can access across the application.
          </p>
        </div>
        {!isEditing ? (
          <Button variant="outline" onClick={() => { setEditingPermissions({ ...rolePermissions! }); setIsEditing(true); }}>
            Edit Permissions
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setIsEditing(false); setEditingPermissions(null); }}>Cancel</Button>
            <Button onClick={savePermissions} disabled={updatePermissions.isPending}>
              {updatePermissions.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" /> Save
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <Shield className="inline-block mr-2 h-4 w-4" />
            Permission Matrix
          </CardTitle>
          <CardDescription>
            {isEditing ? "Click checkboxes to modify permissions." : "View-only mode. Click 'Edit Permissions' to modify."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[250px]">Permission</TableHead>
                    {CONFIGURABLE_ROLES.map((role) => (
                      <TableHead key={role} className="text-center">
                        {USER_ROLE_LABELS[role] || role}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {permissionKeys.map((permissionKey) => (
                    <TableRow key={permissionKey}>
                      <TableCell className="font-medium">
                        {SECURITY_PERMISSION_LABELS[permissionKey]}
                      </TableCell>
                      {CONFIGURABLE_ROLES.map((role) => {
                        const hasPermission = displayPermissions?.[permissionKey]?.includes(role) || false;
                        const isDefault = DEFAULT_SECURITY_PERMISSIONS[permissionKey]?.includes(role) || false;
                        const isDifferentFromDefault = hasPermission !== isDefault;
                        return (
                          <TableCell key={role} className="text-center">
                            {isEditing ? (
                              <Checkbox
                                checked={hasPermission}
                                onCheckedChange={() => handlePermissionToggle(permissionKey, role)}
                              />
                            ) : (
                              <Badge variant={hasPermission ? 'default' : 'outline'} className={isDifferentFromDefault ? 'border-amber-500' : ''}>
                                {hasPermission ? 'Yes' : 'No'}
                              </Badge>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
