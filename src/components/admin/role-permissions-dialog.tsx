'use client';

import { useState, useEffect, useMemo } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Loader2, ChevronDown, ChevronRight, Shield, Search, X } from 'lucide-react';
import type { AppRoleWithPermissions, AppPermission, PermissionCategory } from '@/types/database';

interface RolePermissionsDialogProps {
  role: AppRoleWithPermissions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// UI display labels for permission categories
// Note: 'imports' permissions are merged into 'payments' in the UI
const CATEGORY_LABELS: Record<string, string> = {
  residents: 'Residents',
  houses: 'Houses',
  projects: 'Capital Projects',
  finance: 'Finance & Expenditure',
  payments: 'Payments & Imports',
  billing: 'Billing',
  security: 'Security',
  reports: 'Reports',
  settings: 'Settings',
  approvals: 'Approvals',
  system: 'System',
  documents: 'Documents',
  announcements: 'Announcements',
  notifications: 'Notifications',
  report_subscriptions: 'Report Subscriptions',
  impersonation: 'Impersonation',
};

// Category display order (imports merged into payments)
const CATEGORY_ORDER: PermissionCategory[] = [
  'residents',
  'houses',
  'projects',
  'finance',
  'payments',
  'billing',
  'security',
  'reports',
  'settings',
  'approvals',
  'impersonation',
  'system',
  'documents',
  'announcements',
  'notifications',
  'report_subscriptions',
];

export function RolePermissionsDialog({
  role,
  open,
  onOpenChange,
}: RolePermissionsDialogProps) {
  const { data: allPermissions, isLoading: permissionsLoading } = usePermissions();
  const updatePermissionsMutation = useUpdateRolePermissions();

  // Selected permission IDs (local state)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Track which categories are expanded
  const [expandedCategories, setExpandedCategories] = useState<Set<PermissionCategory>>(
    new Set(CATEGORY_ORDER)
  );

  // Initialize selected permissions from role
  useEffect(() => {
    if (role) {
      setSelectedIds(new Set(role.permissions.map((p) => p.id)));
    }
  }, [role]);

  // Group permissions by category (merge 'imports' into 'payments')
  const permissionsByCategory = useMemo(() => {
    if (!allPermissions) return new Map<PermissionCategory, AppPermission[]>();

    const grouped = new Map<PermissionCategory, AppPermission[]>();
    for (const category of CATEGORY_ORDER) {
      grouped.set(category, []);
    }

    for (const permission of allPermissions) {
      // Map 'imports' category to 'payments' for UI grouping
      const uiCategory = permission.category === 'imports' ? 'payments' : permission.category;
      const categoryPerms = grouped.get(uiCategory) || [];
      categoryPerms.push(permission);
      grouped.set(uiCategory, categoryPerms);
    }

    return grouped;
  }, [allPermissions]);

  // Filter permissions based on search query
  const filteredPermissionsByCategory = useMemo(() => {
    if (!searchQuery.trim()) return permissionsByCategory;

    const query = searchQuery.toLowerCase().trim();
    const filtered = new Map<PermissionCategory, AppPermission[]>();

    for (const [category, perms] of permissionsByCategory) {
      const matchingPerms = perms.filter(
        (p) =>
          p.display_name.toLowerCase().includes(query) ||
          p.name.toLowerCase().includes(query) ||
          (p.description && p.description.toLowerCase().includes(query))
      );
      if (matchingPerms.length > 0) {
        filtered.set(category, matchingPerms);
      }
    }

    return filtered;
  }, [permissionsByCategory, searchQuery]);

  // Auto-expand categories when searching
  useEffect(() => {
    if (searchQuery.trim()) {
      // Expand all categories that have matching permissions
      setExpandedCategories(new Set(filteredPermissionsByCategory.keys()));
    }
  }, [searchQuery, filteredPermissionsByCategory]);

  // Calculate category selection states (based on ALL permissions, not filtered)
  const categoryStates = useMemo(() => {
    const states = new Map<PermissionCategory, 'all' | 'some' | 'none'>();

    for (const [category, perms] of permissionsByCategory) {
      if (perms.length === 0) {
        states.set(category, 'none');
        continue;
      }

      const selectedCount = perms.filter((p) => selectedIds.has(p.id)).length;
      if (selectedCount === 0) {
        states.set(category, 'none');
      } else if (selectedCount === perms.length) {
        states.set(category, 'all');
      } else {
        states.set(category, 'some');
      }
    }

    return states;
  }, [permissionsByCategory, selectedIds]);

  // Calculate filtered selection counts for display
  const filteredCategoryCounts = useMemo(() => {
    const counts = new Map<PermissionCategory, { selected: number; total: number }>();

    for (const [category, perms] of filteredPermissionsByCategory) {
      const selectedCount = perms.filter((p) => selectedIds.has(p.id)).length;
      counts.set(category, { selected: selectedCount, total: perms.length });
    }

    return counts;
  }, [filteredPermissionsByCategory, selectedIds]);

  const togglePermission = (permissionId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(permissionId)) {
        next.delete(permissionId);
      } else {
        next.add(permissionId);
      }
      return next;
    });
  };

  const toggleCategory = (category: PermissionCategory) => {
    const perms = permissionsByCategory.get(category) || [];
    const state = categoryStates.get(category);

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (state === 'all') {
        // Deselect all in this category
        for (const perm of perms) {
          next.delete(perm.id);
        }
      } else {
        // Select all in this category
        for (const perm of perms) {
          next.add(perm.id);
        }
      }
      return next;
    });
  };

  const toggleCategoryExpanded = (category: PermissionCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleSave = async () => {
    await updatePermissionsMutation.mutateAsync({
      roleId: role.id,
      permissionIds: Array.from(selectedIds),
    });
    onOpenChange(false);
  };

  const hasChanges = useMemo(() => {
    const originalIds = new Set(role.permissions.map((p) => p.id));
    if (originalIds.size !== selectedIds.size) return true;
    for (const id of selectedIds) {
      if (!originalIds.has(id)) return true;
    }
    return false;
  }, [role.permissions, selectedIds]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Manage Permissions
          </DialogTitle>
          <DialogDescription>
            Configure permissions for <strong>{role.display_name}</strong>.
            Changes take effect after users log in again.
          </DialogDescription>
        </DialogHeader>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search permissions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
              onClick={() => setSearchQuery('')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {permissionsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <ScrollArea className="h-[50vh] -mx-6 px-6">
            <div className="space-y-2 py-4">
              {/* No results message */}
              {searchQuery && filteredPermissionsByCategory.size === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Search className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No permissions found matching &quot;{searchQuery}&quot;
                  </p>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setSearchQuery('')}
                    className="mt-1"
                  >
                    Clear search
                  </Button>
                </div>
              )}
              {CATEGORY_ORDER.map((category) => {
                const perms = filteredPermissionsByCategory.get(category) || [];
                if (perms.length === 0) return null;

                const state = categoryStates.get(category);
                const isExpanded = expandedCategories.has(category);
                const counts = filteredCategoryCounts.get(category) || { selected: 0, total: 0 };

                return (
                  <Collapsible
                    key={category}
                    open={isExpanded}
                    onOpenChange={() => toggleCategoryExpanded(category)}
                  >
                    <div className="flex items-center justify-between rounded-lg border bg-card p-3">
                      <div className="flex items-center gap-3">
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`category-${category}`}
                            checked={state === 'all'}
                            data-state={state === 'some' ? 'indeterminate' : undefined}
                            className={state === 'some' ? 'data-[state=indeterminate]:bg-primary/50' : ''}
                            onCheckedChange={() => toggleCategory(category)}
                          />
                          <Label
                            htmlFor={`category-${category}`}
                            className="font-medium cursor-pointer"
                          >
                            {CATEGORY_LABELS[category]}
                          </Label>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {counts.selected} / {counts.total}
                      </Badge>
                    </div>

                    <CollapsibleContent>
                      <div className="ml-9 mt-2 space-y-2 pb-2">
                        {perms.map((permission) => (
                          <div
                            key={permission.id}
                            className="flex items-start gap-3 rounded-md border bg-muted/30 p-3"
                          >
                            <Checkbox
                              id={permission.id}
                              checked={selectedIds.has(permission.id)}
                              onCheckedChange={() => togglePermission(permission.id)}
                            />
                            <div className="flex-1 space-y-1">
                              <Label
                                htmlFor={permission.id}
                                className="text-sm font-medium cursor-pointer"
                              >
                                {permission.display_name}
                              </Label>
                              {permission.description && (
                                <p className="text-xs text-muted-foreground">
                                  {permission.description}
                                </p>
                              )}
                              <code className="text-xs text-muted-foreground">
                                {permission.name}
                              </code>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="flex items-center justify-between border-t pt-4">
          <div className="text-sm text-muted-foreground">
            {selectedIds.size} permission{selectedIds.size !== 1 ? 's' : ''} selected
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
