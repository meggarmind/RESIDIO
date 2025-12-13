'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useSecuritySettings,
  useSecurityRolePermissions,
  useUpdateSecurityRolePermissions,
  useUpdateSecuritySetting,
  useResetSecuritySettings,
  useSecurityContactCategories,
  useUpdateSecurityContactCategory,
  useToggleCategoryActive,
} from '@/hooks/use-security';
import {
  Shield,
  Users,
  Settings,
  Loader2,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  Save,
  Edit,
} from 'lucide-react';
import { toast } from 'sonner';
import type { SecurityRolePermissions, UserRole } from '@/types/database';
import { SECURITY_PERMISSION_LABELS, USER_ROLE_LABELS, DEFAULT_SECURITY_PERMISSIONS } from '@/types/database';

// Roles that can be configured
const CONFIGURABLE_ROLES: UserRole[] = ['chairman', 'financial_secretary', 'security_officer'];

export default function SecuritySettingsPage() {
  const { data: settings, isLoading: settingsLoading } = useSecuritySettings();
  const { data: permissions, isLoading: permissionsLoading } = useSecurityRolePermissions();
  const { data: categories, isLoading: categoriesLoading } = useSecurityContactCategories(true);

  const updatePermissionsMutation = useUpdateSecurityRolePermissions();
  const updateSettingMutation = useUpdateSecuritySetting();
  const resetSettingsMutation = useResetSecuritySettings();
  const updateCategoryMutation = useUpdateSecurityContactCategory();
  const toggleCategoryMutation = useToggleCategoryActive();

  const [editingPermissions, setEditingPermissions] = useState<SecurityRolePermissions | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState<{
    default_validity_days: number;
    max_validity_days: number;
  }>({ default_validity_days: 30, max_validity_days: 365 });

  const isLoading = settingsLoading || permissionsLoading || categoriesLoading;

  const handlePermissionChange = (
    permission: keyof SecurityRolePermissions,
    role: UserRole,
    enabled: boolean
  ) => {
    if (!editingPermissions) return;

    const currentRoles = editingPermissions[permission] || [];
    const newRoles = enabled
      ? [...currentRoles, role]
      : currentRoles.filter((r) => r !== role);

    setEditingPermissions({
      ...editingPermissions,
      [permission]: newRoles,
    });
  };

  const savePermissions = async () => {
    if (!editingPermissions) return;

    try {
      await updatePermissionsMutation.mutateAsync(editingPermissions);
      toast.success('Permissions updated successfully');
      setEditingPermissions(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update permissions');
    }
  };

  const handleResetSettings = async () => {
    try {
      await resetSettingsMutation.mutateAsync();
      toast.success('Settings reset to defaults');
      setShowResetDialog(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reset settings');
    }
  };

  const handleUpdateCategory = async () => {
    if (!editingCategoryId) return;

    try {
      await updateCategoryMutation.mutateAsync({
        id: editingCategoryId,
        ...categoryForm,
      });
      toast.success('Category updated');
      setEditingCategoryId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update category');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const displayPermissions = editingPermissions || permissions || DEFAULT_SECURITY_PERMISSIONS;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Security Settings
          </h2>
          <p className="text-muted-foreground">
            Configure security module permissions and settings
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowResetDialog(true)}
          className="text-destructive"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset to Defaults
        </Button>
      </div>

      {/* Role Permissions Matrix */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Role Permissions
              </CardTitle>
              <CardDescription>
                Configure which roles can perform security module actions. Admin always has full access.
              </CardDescription>
            </div>
            {editingPermissions ? (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditingPermissions(null)}>
                  Cancel
                </Button>
                <Button onClick={savePermissions} disabled={updatePermissionsMutation.isPending}>
                  {updatePermissionsMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              </div>
            ) : (
              <Button onClick={() => setEditingPermissions({ ...displayPermissions })}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Permissions
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Permission</TableHead>
                  <TableHead className="text-center">
                    <Badge variant="default">Admin</Badge>
                  </TableHead>
                  {CONFIGURABLE_ROLES.map((role) => (
                    <TableHead key={role} className="text-center">
                      <Badge variant="outline">{USER_ROLE_LABELS[role]}</Badge>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(SECURITY_PERMISSION_LABELS).map(([permission, label]) => (
                  <TableRow key={permission}>
                    <TableCell className="font-medium">{label}</TableCell>
                    <TableCell className="text-center">
                      <CheckCircle className="h-5 w-5 text-green-500 mx-auto" />
                    </TableCell>
                    {CONFIGURABLE_ROLES.map((role) => {
                      const isEnabled = displayPermissions[permission as keyof SecurityRolePermissions]?.includes(role);
                      return (
                        <TableCell key={role} className="text-center">
                          {editingPermissions ? (
                            <Checkbox
                              checked={isEnabled}
                              onCheckedChange={(checked) =>
                                handlePermissionChange(
                                  permission as keyof SecurityRolePermissions,
                                  role,
                                  !!checked
                                )
                              }
                            />
                          ) : isEnabled ? (
                            <CheckCircle className="h-5 w-5 text-green-500 mx-auto" />
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Contact Categories */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Contact Categories
          </CardTitle>
          <CardDescription>
            Configure validity periods and requirements for each contact category
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {categories?.map((category) => (
              <div
                key={category.id}
                className={`flex items-center justify-between p-4 border rounded-lg ${
                  !category.is_active ? 'opacity-50 bg-muted' : ''
                }`}
              >
                <div>
                  <h4 className="font-medium flex items-center gap-2">
                    {category.name}
                    {!category.is_active && (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </h4>
                  <p className="text-sm text-muted-foreground">{category.description}</p>
                  <div className="flex gap-4 mt-2 text-sm">
                    <span>
                      Default validity: <strong>{category.default_validity_days} days</strong>
                    </span>
                    <span>
                      Max validity: <strong>{category.max_validity_days} days</strong>
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingCategoryId(category.id);
                      setCategoryForm({
                        default_validity_days: category.default_validity_days,
                        max_validity_days: category.max_validity_days,
                      });
                    }}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Switch
                    checked={category.is_active}
                    onCheckedChange={() => toggleCategoryMutation.mutate(category.id)}
                    disabled={toggleCategoryMutation.isPending}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
          <CardDescription>
            Configure general security module behavior
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-Expire Contacts</Label>
              <p className="text-sm text-muted-foreground">
                Automatically set contact status to expired when validity ends
              </p>
            </div>
            <Switch
              checked={settings?.auto_expire_contacts ?? true}
              onCheckedChange={(checked) =>
                updateSettingMutation.mutate({
                  key: 'security_auto_expire_contacts',
                  value: checked,
                })
              }
              disabled={updateSettingMutation.isPending}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Maximum Contacts per Resident</Label>
              <p className="text-sm text-muted-foreground">
                Limit the number of security contacts each resident can have (leave empty for unlimited)
              </p>
            </div>
            <Input
              type="number"
              min={1}
              placeholder="Unlimited"
              value={settings?.max_contacts_per_resident || ''}
              onChange={(e) =>
                updateSettingMutation.mutate({
                  key: 'security_max_contacts_per_resident',
                  value: e.target.value ? parseInt(e.target.value) : null,
                })
              }
              className="w-24"
              disabled={updateSettingMutation.isPending}
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Expiry Warning Days</Label>
            <p className="text-sm text-muted-foreground">
              Days before expiry to show warnings (comma-separated)
            </p>
            <Input
              placeholder="7, 3, 1"
              value={settings?.expiry_warning_days?.join(', ') || '7, 3, 1'}
              onChange={(e) => {
                const days = e.target.value
                  .split(',')
                  .map((d) => parseInt(d.trim()))
                  .filter((d) => !isNaN(d) && d > 0);
                updateSettingMutation.mutate({
                  key: 'security_expiry_warning_days',
                  value: days,
                });
              }}
              className="w-48"
              disabled={updateSettingMutation.isPending}
            />
          </div>
        </CardContent>
      </Card>

      {/* Reset Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Reset Security Settings
            </DialogTitle>
            <DialogDescription>
              This will reset all security settings to their default values. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleResetSettings}
              disabled={resetSettingsMutation.isPending}
            >
              {resetSettingsMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" />
              )}
              Reset All Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Edit Dialog */}
      <Dialog open={!!editingCategoryId} onOpenChange={(open) => !open && setEditingCategoryId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Category Settings</DialogTitle>
            <DialogDescription>
              Configure validity periods for this contact category
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Default Validity (days)</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={categoryForm.default_validity_days}
                onChange={(e) =>
                  setCategoryForm({
                    ...categoryForm,
                    default_validity_days: parseInt(e.target.value) || 30,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Maximum Validity (days)</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={categoryForm.max_validity_days}
                onChange={(e) =>
                  setCategoryForm({
                    ...categoryForm,
                    max_validity_days: parseInt(e.target.value) || 365,
                  })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCategoryId(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateCategory} disabled={updateCategoryMutation.isPending}>
              {updateCategoryMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
