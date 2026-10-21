'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useCurrentAdmins } from '@/hooks/use-roles';
import { useAuth } from '@/lib/auth/auth-provider';
import { usePortalAccessOverrides } from '@/hooks/use-portal-access';
import { PortalAccessControl } from '@/components/admin/portal-access-control';
import { AdminRoleActions } from '@/components/admin/admin-role-actions';
import { roleWithTitle } from '@/lib/auth/role-label';
import { Shield, User, Home, AlertCircle } from 'lucide-react';

export function CurrentAdminsList({
  roleFilter,
  clearFilterHref,
}: {
  /** `app_roles.name` to narrow the list to (from the Roles tab holder count). */
  roleFilter?: string;
  clearFilterHref?: string;
} = {}) {
  const { data: allAdmins, isLoading, error } = useCurrentAdmins();
  const admins = roleFilter ? allAdmins?.filter((a) => a.role_name === roleFilter) : allAdmins;
  const { data: overrides } = usePortalAccessOverrides((admins ?? []).map((admin) => admin.profile_id));
  // Read via the session client (auth context), not a SETTINGS_VIEW-gated action.
  const { residentPortalEnabled: generalEnabled } = useAuth();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 border rounded-lg">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-destructive p-4 border border-destructive/20 rounded-md">
        <AlertCircle className="h-5 w-5" />
        <span>Error loading admins: {error.message}</span>
      </div>
    );
  }

  const filterLabel = roleFilter
    ? (allAdmins?.find((a) => a.role_name === roleFilter)?.role_display_name ?? roleFilter)
    : null;
  const filterBar = filterLabel && (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
      <span>
        Showing: <span className="font-medium">{filterLabel}</span>
      </span>
      <Link href={clearFilterHref ?? '#'} className="text-primary underline-offset-4 hover:underline">
        (clear)
      </Link>
    </div>
  );

  if (!admins || admins.length === 0) {
    if (roleFilter) {
      return (
        <div>
          {filterBar}
          <p className="py-4 text-sm text-muted-foreground">No administrators hold this role.</p>
        </div>
      );
    }
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No administrators assigned yet.</p>
        <p className="text-sm">Search for a resident above to assign an admin role.</p>
      </div>
    );
  }

  // Board roles stand out; display only, access is decided by permissions (#826).
  const getRoleBadgeVariant = (roleName: string): 'default' | 'secondary' =>
    roleName === 'super_admin' || roleName === 'chairman' ? 'default' : 'secondary';

  return (
    <div className="space-y-2">
      {filterBar}
      <div className="text-sm font-medium text-muted-foreground mb-3">
        {admins.length} administrator{admins.length !== 1 ? 's' : ''} assigned
      </div>
      <div className="space-y-2">
        {admins.map((admin) => (
          <div
            key={admin.profile_id}
            className="flex flex-wrap items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary/10 text-primary">
                {admin.first_name.charAt(0)}
                {admin.last_name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="font-medium">
                {`${admin.first_name} ${admin.last_name}`.trim()}
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                {admin.email && (
                  <span className="truncate">{admin.email}</span>
                )}
                {admin.house_address && (
                  <span className="flex items-center gap-1">
                    <Home className="h-3 w-3" />
                    {admin.house_address}
                  </span>
                )}
              </div>
            </div>
            <PortalAccessControl
              profileId={admin.profile_id}
              override={overrides?.[admin.profile_id] ?? null}
              generalEnabled={generalEnabled}
            />
            <Badge variant={getRoleBadgeVariant(admin.role_name)}>
              <Shield className="h-3 w-3 mr-1" />
              {roleWithTitle(admin.role_display_name, admin.title_name)}
            </Badge>
            <AdminRoleActions admin={admin} />
          </div>
        ))}
      </div>
    </div>
  );
}
