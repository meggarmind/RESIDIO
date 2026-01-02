'use client';

import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useDebounce } from '@/hooks/use-debounce';
import { useRolesWithPermissions } from '@/hooks/use-roles';
import { useAuth } from '@/lib/auth/auth-provider';
import { useQueryClient } from '@tanstack/react-query';
import { searchResidentsForRoleAssignment, assignRoleToResident, removeRoleFromResident } from '@/actions/roles/assign-role';
import {
  Search,
  User,
  Home,
  Shield,
  Loader2,
  Check,
  X,
  AlertTriangle,
  Link2,
} from 'lucide-react';
import { toast } from 'sonner';
import { LinkAccountDialog } from './link-account-dialog';

type ResidentSearchResult = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone_primary: string | null;
  house_address: string | null;
  profile_id: string | null;
  current_role_id: string | null;
  current_role_name: string | null;
  current_role_display_name: string | null;
};

export function RoleAssignmentSection() {
  const { profile, hasPermission } = useAuth();
  const { data: roles, isLoading: rolesLoading } = useRolesWithPermissions();
  const queryClient = useQueryClient();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<ResidentSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Selected resident state
  const [selectedResident, setSelectedResident] = useState<ResidentSearchResult | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');

  // Assignment dialog state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showSubstitutionDialog, setShowSubstitutionDialog] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

  // Link account dialog state
  const [showLinkDialog, setShowLinkDialog] = useState(false);

  // Permission checks
  const canManageRoles = hasPermission('system.manage_roles');
  const canAssignRoles = hasPermission('system.assign_roles');
  const isSuperAdmin = profile?.role === 'admin';

  // Filter roles based on what the current user can assign
  const assignableRoles = roles?.filter(role => {
    // Don't show resident role (base role)
    if (role.name === 'resident') return false;
    // Don't show super_admin role in dropdown
    if (role.name === 'super_admin') return false;
    // Only super admin can assign chairman role
    if (role.name === 'chairman' && !isSuperAdmin) return false;
    // Only active roles
    if (!role.is_active) return false;
    return true;
  }) || [];

  // Search for residents
  const performSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const result = await searchResidentsForRoleAssignment(query);
      if (result.error) {
        toast.error(result.error);
        setSearchResults([]);
      } else {
        setSearchResults(result.data || []);
      }
    } catch {
      toast.error('Failed to search residents');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search effect
  useEffect(() => {
    performSearch(debouncedSearch);
  }, [debouncedSearch, performSearch]);

  const handleSelectResident = (resident: ResidentSearchResult) => {
    setSelectedResident(resident);
    setSelectedRoleId(resident.current_role_id || '');
    setSearchOpen(false);
    setSearchQuery('');
  };

  const handleClearSelection = () => {
    setSelectedResident(null);
    setSelectedRoleId('');
  };

  const handleRoleChange = (roleId: string) => {
    setSelectedRoleId(roleId);
  };

  const handleAssignClick = () => {
    if (!selectedResident || !selectedRoleId) return;

    // If resident has an existing role, show substitution warning
    if (selectedResident.current_role_id && selectedResident.current_role_id !== selectedRoleId) {
      setShowSubstitutionDialog(true);
    } else {
      setShowConfirmDialog(true);
    }
  };

  const handleRemoveRole = async () => {
    if (!selectedResident) return;

    setIsAssigning(true);
    try {
      const result = await removeRoleFromResident(selectedResident.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Role removed from ${selectedResident.first_name} ${selectedResident.last_name}`);
        // Refresh current admins list
        queryClient.invalidateQueries({ queryKey: ['current-admins'] });
        // Update local state
        setSelectedResident({
          ...selectedResident,
          current_role_id: null,
          current_role_name: null,
          current_role_display_name: null,
        });
        setSelectedRoleId('');
      }
    } catch {
      toast.error('Failed to remove role');
    } finally {
      setIsAssigning(false);
    }
  };

  const confirmAssignment = async () => {
    if (!selectedResident || !selectedRoleId) return;

    setIsAssigning(true);
    try {
      const result = await assignRoleToResident(selectedResident.id, selectedRoleId);
      if (result.error) {
        toast.error(result.error);
      } else {
        const assignedRole = roles?.find(r => r.id === selectedRoleId);
        toast.success(`${assignedRole?.display_name} role assigned to ${selectedResident.first_name} ${selectedResident.last_name}`);
        // Refresh current admins list
        queryClient.invalidateQueries({ queryKey: ['current-admins'] });
        // Update local state
        setSelectedResident({
          ...selectedResident,
          current_role_id: selectedRoleId,
          current_role_name: assignedRole?.name || null,
          current_role_display_name: assignedRole?.display_name || null,
        });
      }
    } catch {
      toast.error('Failed to assign role');
    } finally {
      setIsAssigning(false);
      setShowConfirmDialog(false);
      setShowSubstitutionDialog(false);
    }
  };

  const selectedRole = roles?.find(r => r.id === selectedRoleId);
  const hasChanges = selectedResident && selectedRoleId !== (selectedResident.current_role_id || '');

  if (!canAssignRoles && !canManageRoles) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>You don&apos;t have permission to assign roles.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search Section */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Search Resident</label>
        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={searchOpen}
              className="w-full justify-start text-left font-normal"
            >
              <Search className="mr-2 h-4 w-4 text-muted-foreground" />
              {selectedResident ? (
                <span>
                  {selectedResident.first_name} {selectedResident.last_name}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Search by name or email...
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search residents..."
                value={searchQuery}
                onValueChange={setSearchQuery}
              />
              <CommandList>
                {isSearching ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : searchResults.length === 0 && searchQuery.length >= 2 ? (
                  <CommandEmpty>No residents found.</CommandEmpty>
                ) : (
                  <CommandGroup>
                    {searchResults.map((resident) => (
                      <CommandItem
                        key={resident.id}
                        value={resident.id}
                        onSelect={() => handleSelectResident(resident)}
                        className="flex items-center gap-3 py-3"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">
                            {resident.first_name} {resident.last_name}
                          </div>
                          <div className="text-sm text-muted-foreground truncate">
                            {resident.email || resident.phone_primary || 'No contact info'}
                          </div>
                        </div>
                        {resident.current_role_display_name ? (
                          <Badge variant="secondary" className="ml-auto">
                            {resident.current_role_display_name}
                          </Badge>
                        ) : !resident.profile_id ? (
                          <Badge variant="outline" className="ml-auto text-muted-foreground">
                            No Account
                          </Badge>
                        ) : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Selected Resident Card */}
      {selectedResident && (
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-lg">
                  {selectedResident.first_name} {selectedResident.last_name}
                </h4>
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {selectedResident.email && (
                    <span>{selectedResident.email}</span>
                  )}
                  {selectedResident.house_address && (
                    <span className="flex items-center gap-1">
                      <Home className="h-3 w-3" />
                      {selectedResident.house_address}
                    </span>
                  )}
                </div>
                {selectedResident.current_role_display_name && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-sm">Current Role:</span>
                    <Badge variant="default">
                      <Shield className="h-3 w-3 mr-1" />
                      {selectedResident.current_role_display_name}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClearSelection}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Role Assignment */}
          <div className="mt-6 pt-4 border-t space-y-4">
            {!selectedResident.profile_id && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 text-sm text-amber-700 dark:text-amber-400">
                  <p className="font-medium">No Account Linked</p>
                  <p>This resident does not have a user account. They must register, or an admin can manually link an existing account.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowLinkDialog(true)}
                    className="mt-2 border-amber-300 hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-950/50"
                  >
                    <Link2 className="h-4 w-4 mr-2" />
                    Link Existing Account
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-end gap-4">
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium">Assign Role</label>
                <Select
                  value={selectedRoleId}
                  onValueChange={handleRoleChange}
                  disabled={rolesLoading || isAssigning || !selectedResident.profile_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role to assign" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableRoles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        <div className="flex items-center gap-2">
                          <span>{role.display_name}</span>
                          <Badge variant="outline" className="text-xs">
                            Level {role.level}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleAssignClick}
                disabled={!hasChanges || isAssigning || !selectedResident.profile_id}
              >
                {isAssigning ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Assign Role
              </Button>
            </div>

            {selectedResident.current_role_id && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRemoveRole}
                  disabled={isAssigning}
                  className="text-destructive hover:text-destructive"
                >
                  <X className="mr-2 h-4 w-4" />
                  Remove Current Role
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Role Assignment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to assign the <strong>{selectedRole?.display_name}</strong> role
              to <strong>{selectedResident?.first_name} {selectedResident?.last_name}</strong>?
              <br /><br />
              This will grant them access to administrative features based on the role&apos;s permissions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAssigning}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAssignment} disabled={isAssigning}>
              {isAssigning ? 'Assigning...' : 'Confirm Assignment'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Substitution Warning Dialog */}
      <AlertDialog open={showSubstitutionDialog} onOpenChange={setShowSubstitutionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Replace Existing Role
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{selectedResident?.first_name} {selectedResident?.last_name}</strong> currently
              has the <strong>{selectedResident?.current_role_display_name}</strong> role.
              <br /><br />
              Do you want to replace it with <strong>{selectedRole?.display_name}</strong>?
              <br /><br />
              <span className="text-amber-600">
                The previous role will be removed and the new role will be assigned immediately.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAssigning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAssignment}
              disabled={isAssigning}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {isAssigning ? 'Replacing...' : 'Replace Role'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Link Account Dialog */}
      {selectedResident && (
        <LinkAccountDialog
          open={showLinkDialog}
          onOpenChange={setShowLinkDialog}
          residentId={selectedResident.id}
          residentName={`${selectedResident.first_name} ${selectedResident.last_name}`}
          residentEmail={selectedResident.email}
          onSuccess={() => {
            // Re-search to get updated data
            performSearch(selectedResident.first_name);
          }}
        />
      )}
    </div>
  );
}
