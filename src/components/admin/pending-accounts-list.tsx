'use client';

import { useEffect, useRef, useState } from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  Search,
  Check,
  X,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Inbox,
  Link2,
} from 'lucide-react';
import { usePendingAccounts, useApproveAccount, useRejectAccount } from '@/hooks/use-pending-accounts';
import { useAdminTitles, useAssignableRoles } from '@/hooks/use-roles';
import { useDebounce } from '@/hooks/use-debounce';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { permissionToGrant } from '@/lib/auth/board-roles';
import Link from 'next/link';
import type { PendingAccount } from '@/actions/auth/account-approval';
import {
  searchResidentsForRoleAssignment,
  type ResidentSearchResult,
} from '@/actions/roles/assign-role';
import { RoleTitlePicker, grantableRoles, residentRoleBlock, roleListNotice } from './role-title-picker';

/**
 * Review queue for accounts awaiting approval.
 *
 * Everyone listed here can sign in but has no access to anything — pending
 * accounts are denied at the database level, not just in the UI. Approving one
 * requires choosing the role it will hold.
 */
export function PendingAccountsList() {
  const { data: accounts, isLoading, error, refetch, isRefetching } = usePendingAccounts();
  const { data: roles, isLoading: rolesLoading, error: rolesError } = useAssignableRoles();
  const { data: titles, isLoading: titlesLoading, error: titlesError } = useAdminTitles();
  const { hasPermission } = useAuth();
  const canManageRoles = hasPermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  const approve = useApproveAccount();
  const reject = useRejectAccount();

  const [searchFilter, setSearchFilter] = useState('');
  const [approveTarget, setApproveTarget] = useState<PendingAccount | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingAccount | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [selectedTitleId, setSelectedTitleId] = useState<string>('');
  const [selectedResident, setSelectedResident] = useState<ResidentSearchResult | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Roles the caller may grant: the same permission check as the server's
  // assertCanGrantRoles, which is the enforcement.
  const assignableRoles = grantableRoles(roles, hasPermission);
  const rolesNotice = roleListNotice({
    isLoading: rolesLoading,
    error: rolesError,
    count: assignableRoles.length,
  });

  const selectedRole = assignableRoles.find((role) => role.id === selectedRoleId);
  // Board roles (super_admin, chairman, trustee) carry the widest access.
  const isHighPrivilegeRole = Boolean(
    selectedRole && permissionToGrant(selectedRole.name) === PERMISSIONS.SYSTEM_ASSIGN_BOARD_ROLES
  );
  const hasResidentLink = Boolean(approveTarget?.resident_id || selectedResident);
  const residentBlock = residentRoleBlock(selectedRole, hasResidentLink);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatProvider = (provider: string | null) => {
    if (!provider) return 'Unknown';
    if (provider === 'email') return 'Email & password';
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  };

  const filteredAccounts = accounts?.filter((account) => {
    const needle = searchFilter.toLowerCase();
    return (
      account.email.toLowerCase().includes(needle) ||
      account.full_name.toLowerCase().includes(needle)
    );
  });

  const openApprove = (account: PendingAccount) => {
    setApproveTarget(account);
    setSelectedRoleId('');
    setSelectedTitleId('');
    setSelectedResident(null);
  };

  const handleRoleChange = (roleId: string) => {
    setSelectedRoleId(roleId);
    // A title belongs to one role.
    setSelectedTitleId('');
  };

  const openReject = (account: PendingAccount) => {
    setRejectTarget(account);
    setRejectReason('');
  };

  const handleApprove = async () => {
    if (!approveTarget || !selectedRoleId) return;
    try {
      await approve.mutateAsync({
        profileId: approveTarget.id,
        roleId: selectedRoleId,
        residentId: selectedResident?.id,
        titleId: selectedTitleId || null,
      });
      setApproveTarget(null);
    } catch {
      // useApproveAccount surfaces the error as a toast.
    }
  };

  const handleReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    try {
      await reject.mutateAsync({ profileId: rejectTarget.id, reason: rejectReason });
      setRejectTarget(null);
    } catch {
      // useRejectAccount surfaces the error as a toast.
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h3 className="font-semibold text-lg">Failed to load pending accounts</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {error instanceof Error ? error.message : 'An unexpected error occurred'}
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by name or email..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isRefetching} aria-label="Refresh pending accounts">
          <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !filteredAccounts?.length ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg">
            {searchFilter ? 'No matching accounts' : 'Nothing waiting'}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            {searchFilter
              ? 'No pending account matches that filter.'
              : 'New sign-ups appear here for approval before they get any access.'}
          </p>
          {!searchFilter && canManageRoles && (
            <p className="mt-1 text-sm text-muted-foreground">
              Approving one assigns a role defined under{' '}
              <Link href="/settings/access?tab=roles" className="font-medium text-primary underline-offset-4 hover:underline">
                Roles
              </Link>
              .
            </p>
          )}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Signed up with</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAccounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {account.full_name}
                    {account.resident_id && (
                      <Badge variant="secondary" className="gap-1">
                        <Link2 className="h-3 w-3" />
                        Resident
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <div className="flex items-center gap-2">
                    {account.email}
                    {!account.email_confirmed && (
                      <Badge variant="outline" className="text-xs">
                        Unverified
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{formatProvider(account.provider)}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {formatDate(account.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" onClick={() => openApprove(account)}>
                      <Check className="mr-1 h-4 w-4" />
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openReject(account)}>
                      <X className="mr-1 h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Approve */}
      <Dialog open={approveTarget !== null} onOpenChange={(open) => !open && setApproveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve account</DialogTitle>
            <DialogDescription>
              {approveTarget?.full_name} ({approveTarget?.email}) will be able to sign in and use
              the system with the role you choose.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {approveTarget && (
              <ApproveResidentPicker
                alreadyLinked={Boolean(approveTarget.resident_id)}
                selected={selectedResident}
                onSelect={setSelectedResident}
                disabled={approve.isPending}
              />
            )}

            <Label htmlFor="approve-role">Role</Label>
            {rolesNotice ?? (
              <Select value={selectedRoleId} onValueChange={handleRoleChange}>
                <SelectTrigger id="approve-role">
                  <SelectValue placeholder="Choose a role..." />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {selectedRole?.description && (
              <p className="text-sm text-muted-foreground">{selectedRole.description}</p>
            )}

            <RoleTitlePicker
              role={selectedRole}
              titles={titles ?? []}
              titleId={selectedTitleId}
              onTitleChange={setSelectedTitleId}
              profileId={approveTarget?.id ?? null}
              hasResidentLink={hasResidentLink}
              disabled={approve.isPending}
              titlesLoading={titlesLoading}
              titlesError={titlesError ? titlesError.message : null}
            />

            {isHighPrivilegeRole && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {selectedRole?.display_name} has wide-reaching access, including the ability to
                  manage other administrators. Only grant this to someone you trust completely.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={!selectedRole || Boolean(residentBlock) || approve.isPending}
            >
              {approve.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Approve account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject */}
      <Dialog open={rejectTarget !== null} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject account</DialogTitle>
            <DialogDescription>
              {rejectTarget?.full_name} ({rejectTarget?.email}) will not get access. When they sign
              in, they see that the request was declined and the reason you give below. A rejected
              sign-up cannot be approved later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              placeholder="e.g. We could not match you to a resident record on this estate."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectReason.trim() || reject.isPending}
            >
              {reject.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reject account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Optional resident record for the account being approved (#1316). Lists only
 * residents with no account, because the server refuses a resident already
 * linked to another one. An account that is already linked keeps its link.
 */
function ApproveResidentPicker({
  alreadyLinked,
  selected,
  onSelect,
  disabled,
}: {
  alreadyLinked: boolean;
  selected: ResidentSearchResult | null;
  onSelect: (resident: ResidentSearchResult | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  // The reply to the latest search. A reply is kept with the query it answers,
  // and an older, slower reply is ignored, so stale results never show.
  const [reply, setReply] = useState<{
    query: string;
    results: ResidentSearchResult[];
    error: string | null;
  } | null>(null);
  const latestQuery = useRef('');
  const searchable = !alreadyLinked && debouncedQuery.trim().length >= 2;

  useEffect(() => {
    latestQuery.current = debouncedQuery;
    if (!searchable) return;

    const answer = (results: ResidentSearchResult[], error: string | null) => {
      if (latestQuery.current === debouncedQuery) setReply({ query: debouncedQuery, results, error });
    };
    searchResidentsForRoleAssignment(debouncedQuery)
      .then((result) =>
        result.error
          ? answer([], result.error)
          : answer((result.data ?? []).filter((r) => !r.profile_id), null)
      )
      .catch(() => answer([], 'Failed to search residents'));
  }, [debouncedQuery, searchable]);

  const current = searchable && reply?.query === debouncedQuery ? reply : null;
  const isSearching = searchable && !current;
  const results = current?.results ?? [];
  const searchError = current?.error ?? null;

  if (alreadyLinked) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link2 className="h-4 w-4" />
        This account is already linked to a resident record.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="approve-resident">Resident record (optional)</Label>
      {selected ? (
        <div className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
          <span>
            {selected.first_name} {selected.last_name}
            {selected.house_address && (
              <span className="text-muted-foreground"> · {selected.house_address}</span>
            )}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelect(null)}
            disabled={disabled}
            aria-label="Clear resident record"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <Input
            id="approve-resident"
            placeholder="Search residents with no account..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={disabled}
          />
          {searchError ? (
            <p role="alert" className="text-sm text-destructive">
              {searchError}
            </p>
          ) : isSearching ? (
            <p className="text-sm text-muted-foreground">Searching...</p>
          ) : debouncedQuery.trim().length >= 2 && results.length === 0 ? (
            <p className="text-sm text-muted-foreground">No residents without an account match.</p>
          ) : (
            results.length > 0 && (
              <ul className="max-h-40 overflow-y-auto rounded-md border">
                {results.map((resident) => (
                  <li key={resident.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        onSelect(resident);
                        setQuery('');
                      }}
                    >
                      {resident.first_name} {resident.last_name}
                      {resident.house_address && (
                        <span className="text-muted-foreground"> · {resident.house_address}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}
        </>
      )}
    </div>
  );
}
