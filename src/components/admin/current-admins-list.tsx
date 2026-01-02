'use client';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useCurrentAdmins } from '@/hooks/use-roles';
import { Shield, User, Home, AlertCircle } from 'lucide-react';

export function CurrentAdminsList() {
  const { data: admins, isLoading, error } = useCurrentAdmins();

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

  if (!admins || admins.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No administrators assigned yet.</p>
        <p className="text-sm">Search for a resident above to assign an admin role.</p>
      </div>
    );
  }

  // Group admins by role level for visual hierarchy
  const getRoleBadgeVariant = (level: number): 'default' | 'secondary' | 'outline' => {
    if (level <= 1) return 'default'; // Super Admin, Chairman
    if (level <= 3) return 'secondary'; // Vice Chairman, Secretary, etc.
    return 'outline'; // Other roles
  };

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-muted-foreground mb-3">
        {admins.length} administrator{admins.length !== 1 ? 's' : ''} assigned
      </div>
      <div className="space-y-2">
        {admins.map((admin) => (
          <div
            key={admin.profile_id}
            className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary/10 text-primary">
                {admin.first_name[0]}
                {admin.last_name[0]}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="font-medium">
                {admin.first_name} {admin.last_name}
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
            <Badge variant={getRoleBadgeVariant(admin.role_level)}>
              <Shield className="h-3 w-3 mr-1" />
              {admin.role_display_name}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
