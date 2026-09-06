'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useDebounce } from '@/hooks/use-debounce';
import { useRolesWithPermissions } from '@/hooks/use-roles';
import { useAuth } from '@/lib/auth/auth-provider';
import { useQueryClient } from '@tanstack/react-query';
import {
  searchResidentsForRoleAssignment,
  searchProfilesForRoleAssignment,
  assignRoleToResident,
  removeRoleFromResident,
  assignRoleToProfile,
  removeRoleFromProfile,
} from '@/actions/roles/assign-role';
import type {
  ResidentSearchResult,
  ProfileSearchResult,
} from '@/actions/roles/assign-role';
import {
  PROFILE_APPROVAL_STATUS_LABELS,
  type ProfileApprovalStatus,
} from '@/types/database';
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
  Mail,
} from 'lucide-react';
import { toast } from 'sonner';
import { LinkAccountDialog } from './link-account-dialog';

/**
 * Which directory the search box is pointed at.
 *
 * Residents and accounts are two different populations, not one list with a
 * filter: a resident may exist with no login at all, and a hired security
 * officer may have a login and never appear on any property. Searching one
 * cannot reach the other, so the admin picks which one they are looking for.
 */
type SearchMode = 'residents' | 'accounts';

/**
 * A person the role can be attached to, flattened from either search.
 *
 * `targetId` is deliberately mode-dependent — a resident id in resident mode,
 * a profile id in account mode — because the mutations differ in the same way
 * (assignRoleToResident resolves the resident's profile first;
 * assignRoleToProfile already has it).
 */
type RoleTarget = {
  kind: SearchMode;
  targetId: string;
  name: string;
  email: string | null;
  phone: string | null;
  houseAddress: string | null;
  profileId: string | null;
  approvalStatus: ProfileApprovalStatus | null;
  hasResidentLink: boolean;
  currentRoleId: string | null;
  currentRoleName: string | null;
  currentRoleDisplayName: string | null;
};

function residentToTarget(resident: ResidentSearchResult): RoleTarget {
  return {
    kind: 'residents',
    targetId: resident.id,
    name: `${resident.first_name} ${resident.last_name}`.trim(),
    email: resident.email,
    phone: resident.phone_primary,
    houseAddress: resident.house_address,
    profileId: resident.profile_id,
    approvalStatus: null,
    hasResidentLink: true,
    currentRoleId: resident.current_role_id,
    currentRoleName: resident.current_role_name,
    currentRoleDisplayName: resident.current_role_display_name,
  };
}

function profileToTarget(profile: ProfileSearchResult): RoleTarget {
  return {
    kind: 'accounts',
    targetId: profile.profile_id,
    name: profile.full_name?.trim() || profile.email,
    email: profile.email,
    phone: null,
    houseAddress: null,
    profileId: profile.profile_id,
    approvalStatus: profile.approval_status,
    hasResidentLink: Boolean(profile.resident_id),
    currentRoleId: profile.current_role_id,
    currentRoleName: profile.current_role_name,
    currentRoleDisplayName: profile.current_role_display_name,
  };
}

export function RoleAssignmentSection() {
  const { profile, hasPermission } = useAuth();
  const { data: roles, isLoading: rolesLoading } = useRolesWithPermissions();
  const queryClient = useQueryClient();

  // Search state
  const [searchMode, setSearchMode] = useState<SearchMode>('residents');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<RoleTarget[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Selected person state
  const [selectedTarget, setSelectedTarget] = useState<RoleTarget | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');

  // Assignment dialog state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showSubstitutionDialog, setShowSubstitutionDialog] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

  // Link account dialog state
  const [showLinkDialog, setShowLinkDialog] = useState(false);

  // Permission checks
  const canManageRoles = hasPermission('system.manage_roles');
  const canAssignRoles = hasPermission('system.assign_roles');
  // Mirrors the server guard in assignRoleToProfile, which checks
  // `auth.roleName !== 'super_admin'`. Previously read the legacy
  // `profiles.role` column, removed by #193.
  const isSuperAdmin = profile?.role_name === 'super_admin';

  // Filter roles based on what the current user can assign.
  // Mirrors the server-side guards in assignRoleToProfile — the server is the
  // enforcement boundary, this just avoids offering choices that would be
  // rejected.
  const assignableRoles = roles?.filter(role => {
    // Don't show resident role (base role)
    if (role.name === 'resident') return false;
    // Super admin and chairman may only be granted by an existing super admin.
    // Previously super_admin was hidden unconditionally, which meant no super
    // admin could ever be appointed through the app at all.
    if ((role.name === 'super_admin' || role.name === 'chairman') && !isSuperAdmin) return false;
    // Only active roles
    if (!role.is_active) return false;
    return true;
  }) || [];

  // Search for residents or accounts, depending on the active mode
  const performSearch = useCallback(async (query: string, mode: SearchMode) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      if (mode === 'accounts') {
        const result = await searchProfilesForRoleAssignment(query);
        if (result.error) {
          toast.error(result.error);
          setSearchResults([]);
        } else {
          setSearchResults((result.data || []).map(profileToTarget));
        }
      } else {
        const result = await searchResidentsForRoleAssignment(query);
        if (result.error) {
          toast.error(result.error);
          setSearchResults([]);
        } else {
          setSearchResults((result.data || []).map(residentToTarget));
        }
      }
    } catch {
      toast.error(mode === 'accounts' ? 'Failed to search accounts' : 'Failed to search residents');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search effect
  useEffect(() => {
    performSearch(debouncedSearch, searchMode);
  }, [debouncedSearch, searchMode, performSearch]);

  const handleModeChange = (mode: string) => {
    // Radix clears the value when the active item is pressed again; ignore that
    // rather than leaving the section with no mode at all.
    if (!mode || mode === searchMode) return;
    setSearchMode(mode as SearchMode);
    // The query survives the switch on purpose — "not in residents, try
    // accounts" is the common reason to flip, and retyping the name is busywork.
    // The results and the selection do not: they belong to the other directory.
    setSearchResults([]);
    setSelectedTarget(null);
    setSelectedRoleId('');
    setShowLinkDialog(false);
  };

  const handleSelectTarget = (target: RoleTarget) => {
    setSelectedTarget(target);
    setSelectedRoleId(target.currentRoleId || '');
    setSearchOpen(false);
    setSearchQuery('');
  };

  const handleClearSelection = () => {
    setSelectedTarget(null);
    setSelectedRoleId('');
  };

  const handleRoleChange = (roleId: string) => {
    setSelectedRoleId(roleId);
  };

  const handleAssignClick = () => {
    if (!selectedTarget || !selectedRoleId) return;

    // If the person already holds a role, show the substitution warning
    if (selectedTarget.currentRoleId && selectedTarget.currentRoleId !== selectedRoleId) {
      setShowSubstitutionDialog(true);
    } else {
      setShowConfirmDialog(true);
    }
  };

  const confirmRemoveRole = async () => {
    if (!selectedTarget) return;

    setIsAssigning(true);
    try {
      const result = selectedTarget.kind === 'accounts'
        ? await removeRoleFromProfile(selectedTarget.targetId)
        : await removeRoleFromResident(selectedTarget.targetId);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Role removed from ${selectedTarget.name}`);
        // Refresh current admins list
        queryClient.invalidateQueries({ queryKey: ['current-admins'] });
        queryClient.invalidateQueries({ queryKey: ['pending-accounts'] });
        queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
        // Update local state. An account with no resident link is sent back to
        // pending by the server, so reflect that here too.
        const returnsToPending =
          selectedTarget.kind === 'accounts' && !selectedTarget.hasResidentLink;
        setSelectedTarget({
          ...selectedTarget,
          approvalStatus: returnsToPending ? 'pending' : selectedTarget.approvalStatus,
          currentRoleId: null,
          currentRoleName: null,
          currentRoleDisplayName: null,
        });
        setSelectedRoleId('');
      }
    } catch {
      toast.error('Failed to remove role');
    } finally {
      setIsAssigning(false);
      setShowRemoveDialog(false);
    }
  };

  const confirmAssignment = async () => {
    if (!selectedTarget || !selectedRoleId) return;

    setIsAssigning(true);
    try {
      const result = selectedTarget.kind === 'accounts'
        ? await assignRoleToProfile(selectedTarget.targetId, selectedRoleId)
        : await assignRoleToResident(selectedTarget.targetId, selectedRoleId);

      if (result.error) {
        toast.error(result.error);
      } else {
        const assignedRole = roles?.find(r => r.id === selectedRoleId);
        toast.success(`${assignedRole?.display_name} role assigned to ${selectedTarget.name}`);
        // Refresh current admins list
        queryClient.invalidateQueries({ queryKey: ['current-admins'] });
        // Update local state
        setSelectedTarget({
          ...selectedTarget,
          currentRoleId: selectedRoleId,
          currentRoleName: assignedRole?.name || null,
          currentRoleDisplayName: assignedRole?.display_name || null,
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
  const hasChanges = selectedTarget && selectedRoleId !== (selectedTarget.currentRoleId || '');

  const isAccountMode = searchMode === 'accounts';

  // An account that has not been approved cannot usefully hold a role — a
  // pending or suspended profile resolves no permissions in the database at
  // all, so granting one here would look like it worked and change nothing.
  // Approval is the gate, and it lives on the Pending Accounts tab.
  const unapprovedAccount =
    selectedTarget?.kind === 'accounts' && selectedTarget.approvalStatus !== 'active';

  // Residents only hold a role through a linked account.
  const missingAccountLink = selectedTarget?.kind === 'residents' && !selectedTarget.profileId;

  const assignmentBlocked = Boolean(unapprovedAccount || missingAccountLink);

  // Mirror the server-side removal guards in removeRoleFromProfile: the super
  // administrator role cannot be removed at all, and only a super admin may
  // remove the chairman.
  const canRemoveCurrentRole = Boolean(
    selectedTarget?.currentRoleId
    && selectedTarget.currentRoleName !== 'super_admin'
    && !(selectedTarget.currentRoleName === 'chairman' && !isSuperAdmin)
  );

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-sm font-medium">
            {isAccountMode ? 'Search Account' : 'Search Resident'}
          </label>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={searchMode}
            onValueChange={handleModeChange}
          >
            <ToggleGroupItem value="residents" aria-label="Search residents">
              <Home className="h-3.5 w-3.5 mr-1.5" />
              Residents
            </ToggleGroupItem>
            <ToggleGroupItem value="accounts" aria-label="Search accounts">
              <Mail className="h-3.5 w-3.5 mr-1.5" />
              Accounts
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <p className="text-sm text-muted-foreground">
          {isAccountMode
            ? 'Search everyone who has an account, including staff who do not live on the estate.'
            : 'Search people with a resident record on an estate property.'}
        </p>
        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={searchOpen}
              className="w-full justify-start text-left font-normal"
            >
              <Search className="mr-2 h-4 w-4 text-muted-foreground" />
              {selectedTarget ? (
                <span>{selectedTarget.name}</span>
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
                placeholder={isAccountMode ? 'Search accounts...' : 'Search residents...'}
                value={searchQuery}
                onValueChange={setSearchQuery}
              />
              <CommandList>
                {isSearching ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : searchResults.length === 0 && searchQuery.length >= 2 ? (
                  <CommandEmpty>
                    {isAccountMode ? 'No accounts found.' : 'No residents found.'}
                  </CommandEmpty>
                ) : (
                  <CommandGroup>
                    {searchResults.map((target) => (
                      <CommandItem
                        key={target.targetId}
                        value={target.targetId}
                        onSelect={() => handleSelectTarget(target)}
                        className="flex items-center gap-3 py-3"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{target.name}</div>
                          <div className="text-sm text-muted-foreground truncate">
                            {target.email || target.phone || 'No contact info'}
                          </div>
                        </div>
                        {target.currentRoleDisplayName ? (
                          <Badge variant="secondary" className="ml-auto">
                            {target.currentRoleDisplayName}
                          </Badge>
                        ) : target.kind === 'accounts' && target.approvalStatus !== 'active' ? (
                          <Badge variant="outline" className="ml-auto text-muted-foreground">
                            {PROFILE_APPROVAL_STATUS_LABELS[target.approvalStatus!]}
                          </Badge>
                        ) : target.kind === 'residents' && !target.profileId ? (
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

      {/* Selected Person Card */}
      {selectedTarget && (
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-lg">{selectedTarget.name}</h4>
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {selectedTarget.email && (
                    <span>{selectedTarget.email}</span>
                  )}
                  {selectedTarget.houseAddress && (
                    <span className="flex items-center gap-1">
                      <Home className="h-3 w-3" />
                      {selectedTarget.houseAddress}
                    </span>
                  )}
                  {selectedTarget.kind === 'accounts' && !selectedTarget.hasResidentLink && (
                    <span>Not linked to a resident record</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {selectedTarget.currentRoleDisplayName && (
                    <>
                      <span className="text-sm">Current Role:</span>
                      <Badge variant="default">
                        <Shield className="h-3 w-3 mr-1" />
                        {selectedTarget.currentRoleDisplayName}
                      </Badge>
                    </>
                  )}
                  {selectedTarget.kind === 'accounts' && selectedTarget.approvalStatus && (
                    <Badge variant={selectedTarget.approvalStatus === 'active' ? 'secondary' : 'outline'}>
                      {PROFILE_APPROVAL_STATUS_LABELS[selectedTarget.approvalStatus]}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClearSelection}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Role Assignment */}
          <div className="mt-6 pt-4 border-t space-y-4">
            {missingAccountLink && (
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

            {unapprovedAccount && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 text-sm text-amber-700 dark:text-amber-400">
                  <p className="font-medium">Account Not Approved</p>
                  <p>
                    {selectedTarget.approvalStatus === 'pending'
                      ? 'This account is still waiting for approval. Approve it under Pending Accounts — that step chooses the role and grants access in one go.'
                      : `This account is ${PROFILE_APPROVAL_STATUS_LABELS[selectedTarget.approvalStatus!].toLowerCase()} and holds no permissions. Restore it before assigning a role.`}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-end gap-4">
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium">Assign Role</label>
                <Select
                  value={selectedRoleId}
                  onValueChange={handleRoleChange}
                  disabled={rolesLoading || isAssigning || assignmentBlocked}
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
                disabled={!hasChanges || isAssigning || assignmentBlocked}
              >
                {isAssigning ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Assign Role
              </Button>
            </div>

            {selectedTarget.currentRoleId && (
              <div className="flex justify-end">
                {canRemoveCurrentRole ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowRemoveDialog(true)}
                    disabled={isAssigning}
                    className="text-destructive hover:text-destructive"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Remove Current Role
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {selectedTarget.currentRoleName === 'super_admin'
                      ? 'The Super Administrator role cannot be removed through the app.'
                      : 'Only a Super Administrator can remove the Chairman role.'}
                  </p>
                )}
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
              to <strong>{selectedTarget?.name}</strong>?
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
              <strong>{selectedTarget?.name}</strong> currently
              has the <strong>{selectedTarget?.currentRoleDisplayName}</strong> role.
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

      {/* Removal Confirmation Dialog */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Remove Current Role
            </AlertDialogTitle>
            <AlertDialogDescription>
              Remove the <strong>{selectedTarget?.currentRoleDisplayName}</strong> role
              from <strong>{selectedTarget?.name}</strong>?
              <br /><br />
              {selectedTarget?.kind === 'accounts' && !selectedTarget.hasResidentLink ? (
                <span className="text-destructive">
                  This account is not linked to a resident record, so it has no role to fall back
                  on. It returns to pending and loses access until it is approved again.
                </span>
              ) : (
                'They keep portal access as a resident, but lose every administrative permission.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAssigning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemoveRole}
              disabled={isAssigning}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isAssigning ? 'Removing...' : 'Remove Role'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Link Account Dialog */}
      {selectedTarget?.kind === 'residents' && (
        <LinkAccountDialog
          open={showLinkDialog}
          onOpenChange={setShowLinkDialog}
          residentId={selectedTarget.targetId}
          residentName={selectedTarget.name}
          residentEmail={selectedTarget.email}
          onSuccess={() => {
            // Re-search to get updated data. The resident search matches
            // first_name/last_name separately, so feed it a single name part
            // rather than the joined display name.
            performSearch(selectedTarget.name.split(' ')[0], 'residents');
          }}
        />
      )}
    </div>
  );
}
