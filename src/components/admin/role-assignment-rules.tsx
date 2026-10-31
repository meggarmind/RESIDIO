'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertCircle, Save, RotateCcw, Info } from 'lucide-react';
import { useRoleAssignmentRules, useBatchUpdateRoleAssignmentRules, useRolesWithPermissions } from '@/hooks/use-roles';
import { RESIDENT_ROLE_LABELS, type ResidentRole } from '@/types/database';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';

// Order of resident roles for display
const RESIDENT_ROLE_ORDER: ResidentRole[] = [
  'resident_landlord',
  'non_resident_landlord',
  'tenant',
  'developer',
  'co_resident',
  'household_member',
  'domestic_staff',
  'caretaker',
];

// Role categories for styling
const PRIMARY_ROLES: ResidentRole[] = ['resident_landlord', 'non_resident_landlord', 'tenant', 'developer'];
const SECONDARY_ROLES: ResidentRole[] = ['co_resident', 'household_member', 'domestic_staff', 'caretaker'];

export function RoleAssignmentRulesEditor() {
  const { data: rules, isLoading: rulesLoading, error: rulesError } = useRoleAssignmentRules();
  const { data: roles, isLoading: rolesLoading, error: rolesError } = useRolesWithPermissions();
  const batchUpdate = useBatchUpdateRoleAssignmentRules();

  const [pendingChanges, setPendingChanges] = useState<
    Map<string, { residentRole: ResidentRole; appRoleId: string; isAllowed: boolean }>
  >(new Map());

  const isLoading = rulesLoading || rolesLoading;

  // super_admin is an operator role, not tied to a resident type, so it has no
  // assignment rules (#825). Inactive roles cannot be assigned, and the rules read
  // ignores them, so they get no column either (#1318).
  const executiveRoles = roles?.filter((r) => r.name !== 'super_admin' && r.is_active) || [];

  const getKey = (residentRole: ResidentRole, appRoleId: string) =>
    `${residentRole}-${appRoleId}`;

  const getCurrentValue = (residentRole: ResidentRole, appRoleId: string) => {
    const key = getKey(residentRole, appRoleId);

    // Check pending changes first
    if (pendingChanges.has(key)) {
      return pendingChanges.get(key)!.isAllowed;
    }

    // Fall back to current rules
    const roleRules = rules?.[residentRole];
    const rule = roleRules?.find((r) => r.roleId === appRoleId);
    return rule?.isAllowed ?? true;
  };

  const handleToggle = (residentRole: ResidentRole, appRoleId: string, isAllowed: boolean) => {
    const key = getKey(residentRole, appRoleId);
    const currentFromServer = rules?.[residentRole]?.find((r) => r.roleId === appRoleId)?.isAllowed ?? true;

    // If toggling back to server value, remove from pending
    if (isAllowed === currentFromServer) {
      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    } else {
      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.set(key, { residentRole, appRoleId, isAllowed });
        return next;
      });
    }
  };

  const handleSave = async () => {
    const updates = Array.from(pendingChanges.values());
    if (updates.length === 0) return;

    try {
      await batchUpdate.mutateAsync(updates);
      setPendingChanges(new Map());
    } catch {
      // The hook's onError already showed the reason; keep the unsaved changes.
    }
  };

  const handleReset = () => {
    setPendingChanges(new Map());
  };

  const hasChanges = pendingChanges.size > 0;

  const loadError = rulesError ?? rolesError;
  if (loadError) {
    return (
      <div role="alert" className="flex items-center gap-2 text-destructive p-4 border border-destructive/20 rounded-md">
        <AlertCircle className="h-5 w-5" />
        <span>
          Error loading {rulesError ? 'rules' : 'roles'}: {loadError.message}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>How Role Assignment Rules Work</AlertTitle>
        <AlertDescription>
          Each row is a resident type, each column an active role. When an account linked to a
          resident is given a role, the resident type of their primary active house (for example
          Owner-Occupier or Renter) is checked against this table: off blocks the role, on allows
          it. Contractor has no row and is never restricted, nor are accounts with no linked
          resident or no active house.
        </AlertDescription>
      </Alert>

      {/* Action bar */}
      {hasChanges && (
        <div className="flex items-center justify-between p-3 bg-muted rounded-md">
          <span className="text-sm text-muted-foreground">
            {pendingChanges.size} unsaved change{pendingChanges.size !== 1 ? 's' : ''}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} disabled={batchUpdate.isPending}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
            <Button size="sm" onClick={handleSave} disabled={batchUpdate.isPending}>
              <Save className="h-4 w-4 mr-1" />
              {batchUpdate.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      )}

      {/* Rules matrix */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-background z-10 min-w-[180px]">
                Resident Type
              </TableHead>
              {isLoading ? (
                <TableHead>
                  <Skeleton className="h-4 w-24" />
                </TableHead>
              ) : (
                executiveRoles.map((role) => (
                  <TableHead key={role.id} className="text-center min-w-[120px]">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">{role.display_name}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{role.permissions.length} permissions</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                ))
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Loading skeleton
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell className="sticky left-0 bg-background">
                    <Skeleton className="h-6 w-32" />
                  </TableCell>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j} className="text-center">
                      <Skeleton className="h-6 w-10 mx-auto" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <>
                {/* Primary roles section */}
                <TableRow>
                  <TableCell colSpan={executiveRoles.length + 1} className="bg-muted/50">
                    <span className="text-xs font-medium uppercase text-muted-foreground">
                      Primary Residents
                    </span>
                  </TableCell>
                </TableRow>
                {RESIDENT_ROLE_ORDER.filter((r) => PRIMARY_ROLES.includes(r)).map((residentRole) => (
                  <TableRow key={residentRole}>
                    <TableCell className="sticky left-0 bg-background font-medium">
                      <Badge variant="outline">{RESIDENT_ROLE_LABELS[residentRole]}</Badge>
                    </TableCell>
                    {executiveRoles.map((appRole) => {
                      const isAllowed = getCurrentValue(residentRole, appRole.id);
                      const key = getKey(residentRole, appRole.id);
                      const hasChange = pendingChanges.has(key);

                      return (
                        <TableCell key={appRole.id} className="text-center">
                          <div className={`inline-flex items-center ${hasChange ? 'ring-2 ring-primary ring-offset-2 rounded-full' : ''}`}>
                            <Switch
                              checked={isAllowed}
                              onCheckedChange={(checked) =>
                                handleToggle(residentRole, appRole.id, checked)
                              }
                              disabled={batchUpdate.isPending}
                            />
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}

                {/* Secondary roles section */}
                <TableRow>
                  <TableCell colSpan={executiveRoles.length + 1} className="bg-muted/50">
                    <span className="text-xs font-medium uppercase text-muted-foreground">
                      Secondary Residents (Household and Staff)
                    </span>
                  </TableCell>
                </TableRow>
                {RESIDENT_ROLE_ORDER.filter((r) => SECONDARY_ROLES.includes(r)).map((residentRole) => (
                  <TableRow key={residentRole}>
                    <TableCell className="sticky left-0 bg-background font-medium">
                      <Badge variant="secondary">{RESIDENT_ROLE_LABELS[residentRole]}</Badge>
                    </TableCell>
                    {executiveRoles.map((appRole) => {
                      const isAllowed = getCurrentValue(residentRole, appRole.id);
                      const key = getKey(residentRole, appRole.id);
                      const hasChange = pendingChanges.has(key);

                      return (
                        <TableCell key={appRole.id} className="text-center">
                          <div className={`inline-flex items-center ${hasChange ? 'ring-2 ring-primary ring-offset-2 rounded-full' : ''}`}>
                            <Switch
                              checked={isAllowed}
                              onCheckedChange={(checked) =>
                                handleToggle(residentRole, appRole.id, checked)
                              }
                              disabled={batchUpdate.isPending}
                            />
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </>
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Toggle switches to allow (on) or restrict (off) role assignments. Changes are highlighted
        and must be saved.
      </p>
    </div>
  );
}
