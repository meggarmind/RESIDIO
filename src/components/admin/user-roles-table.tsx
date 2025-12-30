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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, UserCog, Shield, AlertCircle } from 'lucide-react';
import { useUsersWithRoles, useRolesWithPermissions, useAssignRoleToUser } from '@/hooks/use-roles';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type UserWithRole = {
  id: string;
  email: string;
  full_name: string;
  role_id: string | null;
  role_name: string | null;
  role_display_name: string | null;
};

export function UserRolesTable() {
  const { data: users, isLoading: usersLoading, error: usersError } = useUsersWithRoles();
  const { data: roles, isLoading: rolesLoading } = useRolesWithPermissions();
  const assignRole = useAssignRoleToUser();

  const [searchQuery, setSearchQuery] = useState('');
  const [pendingAssignment, setPendingAssignment] = useState<{
    user: UserWithRole;
    newRoleId: string;
    newRoleName: string;
  } | null>(null);

  const isLoading = usersLoading || rolesLoading;

  // Filter users based on search
  const filteredUsers = users?.filter(
    (user) =>
      user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.role_display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
  );

  const handleRoleChange = (user: UserWithRole, newRoleId: string) => {
    const newRole = roles?.find((r) => r.id === newRoleId);
    if (!newRole) return;

    setPendingAssignment({
      user,
      newRoleId,
      newRoleName: newRole.display_name,
    });
  };

  const confirmAssignment = async () => {
    if (!pendingAssignment) return;

    await assignRole.mutateAsync({
      userId: pendingAssignment.user.id,
      roleId: pendingAssignment.newRoleId,
    });

    setPendingAssignment(null);
  };

  const getRoleBadgeVariant = (roleName: string | null) => {
    switch (roleName) {
      case 'super_admin':
        return 'destructive';
      case 'chairman':
      case 'vice_chairman':
        return 'default';
      case 'financial_officer':
      case 'security_officer':
      case 'secretary':
      case 'project_manager':
        return 'secondary';
      case 'resident':
        return 'outline';
      default:
        return 'outline';
    }
  };

  if (usersError) {
    return (
      <div className="flex items-center gap-2 text-destructive p-4 border border-destructive/20 rounded-md">
        <AlertCircle className="h-5 w-5" />
        <span>Error loading users: {usersError.message}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search users by name, email, or role..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Current Role</TableHead>
              <TableHead className="w-[250px]">Assign Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Loading skeleton
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-9 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : filteredUsers?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                  {searchQuery ? 'No users match your search' : 'No users found'}
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers?.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                        <UserCog className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="font-medium">{user.full_name}</div>
                        <div className="text-sm text-muted-foreground">{user.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.role_display_name ? (
                      <Badge variant={getRoleBadgeVariant(user.role_name)}>
                        <Shield className="h-3 w-3 mr-1" />
                        {user.role_display_name}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        No Role
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={user.role_id || ''}
                      onValueChange={(value) => handleRoleChange(user, value)}
                      disabled={assignRole.isPending}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles?.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            <div className="flex items-center gap-2">
                              <span>{role.display_name}</span>
                              {role.is_system_role && (
                                <Badge variant="outline" className="text-xs">
                                  System
                                </Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Stats */}
      {!isLoading && users && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {filteredUsers?.length || 0} of {users.length} users
          </span>
          <span>
            {users.filter((u) => u.role_id).length} users with roles assigned
          </span>
        </div>
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={!!pendingAssignment} onOpenChange={() => setPendingAssignment(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Role Assignment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to assign the role{' '}
              <strong>{pendingAssignment?.newRoleName}</strong> to{' '}
              <strong>{pendingAssignment?.user.full_name}</strong>?
              {pendingAssignment?.user.role_display_name && (
                <>
                  <br />
                  <br />
                  This will replace their current role:{' '}
                  <strong>{pendingAssignment.user.role_display_name}</strong>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAssignment} disabled={assignRole.isPending}>
              {assignRole.isPending ? 'Assigning...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
