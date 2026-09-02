'use client';

import { useState, useMemo } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Loader2, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import {
  permissionCategoryLabel,
  resolvePermissionCategory,
  sortPermissionCategories,
} from '@/config/permission-categories';
import type { AppPermission } from '@/types/database';

interface PermissionPickerProps {
  /** Every assignable permission, from `usePermissions()`. */
  permissions: AppPermission[] | undefined;
  isLoading?: boolean;
  /** Currently granted permission ids. */
  value: Set<string>;
  onChange: (next: Set<string>) => void;
  className?: string;
}

/**
 * Module-and-privilege picker: a checkbox per module that grants everything in
 * it, and a checkbox per individual permission underneath for finer control.
 *
 * Controlled and fetch-free so the same component serves both editing an
 * existing role and creating one. Previously this lived inside the edit dialog,
 * which is why creating a role could not grant anything.
 *
 * The module list is derived from the permissions actually returned rather than
 * a hardcoded array. The hardcoded version silently omitted `notes`,
 * `email_imports` and `personnel`, so those permissions were invisible here and
 * could not be granted to a new role at all.
 */
export function PermissionPicker({
  permissions,
  isLoading = false,
  value,
  onChange,
  className,
}: PermissionPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Group by display category, folding aliases (imports reads as Payments).
  const byCategory = useMemo(() => {
    const grouped = new Map<string, AppPermission[]>();
    for (const permission of permissions ?? []) {
      const category = resolvePermissionCategory(permission.category);
      const bucket = grouped.get(category);
      if (bucket) bucket.push(permission);
      else grouped.set(category, [permission]);
    }
    return grouped;
  }, [permissions]);

  const orderedCategories = useMemo(
    () => sortPermissionCategories(byCategory.keys()),
    [byCategory]
  );

  const isSearching = searchQuery.trim().length > 0;

  const filteredByCategory = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return byCategory;

    const filtered = new Map<string, AppPermission[]>();
    for (const [category, perms] of byCategory) {
      const matches = perms.filter(
        (p) =>
          p.display_name.toLowerCase().includes(query) ||
          p.name.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query)
      );
      if (matches.length > 0) filtered.set(category, matches);
    }
    return filtered;
  }, [byCategory, searchQuery]);

  /** Tri-state per module, computed over ALL its permissions, not the filtered view. */
  const categoryState = useMemo(() => {
    const states = new Map<string, 'all' | 'some' | 'none'>();
    for (const [category, perms] of byCategory) {
      const selected = perms.filter((p) => value.has(p.id)).length;
      states.set(category, selected === 0 ? 'none' : selected === perms.length ? 'all' : 'some');
    }
    return states;
  }, [byCategory, value]);

  const togglePermission = (id: string) => {
    const next = new Set(value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  /** Grant or revoke a whole module in one gesture. */
  const toggleCategory = (category: string) => {
    const perms = byCategory.get(category) ?? [];
    const next = new Set(value);
    if (categoryState.get(category) === 'all') {
      for (const p of perms) next.delete(p.id);
    } else {
      for (const p of perms) next.add(p.id);
    }
    onChange(next);
  };

  const toggleExpanded = (category: string) => {
    const next = new Set(collapsed);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    setCollapsed(next);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search modules and privileges..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-9"
        />
        {searchQuery && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ScrollArea className="mt-3 h-[45vh] pr-3">
        <div className="space-y-2 pb-2">
          {searchQuery && filteredByCategory.size === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Search className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nothing matches &quot;{searchQuery}&quot;
              </p>
              <Button type="button" variant="link" size="sm" onClick={() => setSearchQuery('')}>
                Clear search
              </Button>
            </div>
          )}

          {orderedCategories.map((category) => {
            const perms = filteredByCategory.get(category);
            if (!perms || perms.length === 0) return null;

            const state = categoryState.get(category);
            // While searching, every surviving module opens so the matches are
            // visible without hunting; collapse state is remembered for after.
            const isExpanded = isSearching || !collapsed.has(category);
            const total = byCategory.get(category)?.length ?? 0;
            const granted = byCategory.get(category)?.filter((p) => value.has(p.id)).length ?? 0;

            return (
              <Collapsible
                key={category}
                open={isExpanded}
                onOpenChange={() => toggleExpanded(category)}
              >
                <div className="flex items-center justify-between rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-3">
                    <CollapsibleTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`module-${category}`}
                        checked={state === 'all'}
                        data-state={state === 'some' ? 'indeterminate' : undefined}
                        className={
                          state === 'some' ? 'data-[state=indeterminate]:bg-primary/50' : ''
                        }
                        onCheckedChange={() => toggleCategory(category)}
                      />
                      <Label
                        htmlFor={`module-${category}`}
                        className="cursor-pointer font-medium"
                      >
                        {permissionCategoryLabel(category)}
                      </Label>
                    </div>
                  </div>
                  <Badge variant={granted === total ? 'default' : 'secondary'} className="text-xs">
                    {granted} / {total}
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
                          checked={value.has(permission.id)}
                          onCheckedChange={() => togglePermission(permission.id)}
                        />
                        <div className="flex-1 space-y-1">
                          <Label
                            htmlFor={permission.id}
                            className="cursor-pointer text-sm font-medium"
                          >
                            {permission.display_name}
                          </Label>
                          {permission.description && (
                            <p className="text-xs text-muted-foreground">
                              {permission.description}
                            </p>
                          )}
                          <code className="text-xs text-muted-foreground">{permission.name}</code>
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
    </div>
  );
}
