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
import { useRolesWithPermissions } from '@/hooks/use-roles';
import { useAuth } from '@/lib/auth/auth-provider';
import type { PendingAccount } from '@/actions/auth/account-approval';

/**
 * Review queue for accounts awaiting approval.
 *
 * Everyone listed here can sign in but has no access to anything — pending
 * accounts are denied at the database level, not just in the UI. Approving one
 * requires choosing the role it will hold.
 */
export function PendingAccountsList() {
  const { data: accounts, isLoading, error, refetch, isRefetching } = usePendingAccounts();
  const { data: roles } = useRolesWithPermissions();
  const { profile } = useAuth();
  const approve = useApproveAccount();
  const reject = useRejectAccount();

  const [searchFilter, setSearchFilter] = useState('');
  const [approveTarget, setApproveTarget] = useState<PendingAccount | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingAccount | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [rejectReason, setRejectReason] = useState('');

  // Mirrors the server guards in assignRoleToProfile: super_admin and chairman
  // may only be granted by an existing super admin.
  const isSuperAdmin = profile?.role === 'admin';
  const assignableRoles =
    roles?.filter((role) => {
      if (!role.is_active) return false;
      if ((role.name === 'super_admin' || role.name === 'chairman') && !isSuperAdmin) return false;
      return true;
    }) ?? [];

  const selectedRole = assignableRoles.find((role) => role.id === selectedRoleId);
  const isHighPrivilegeRole =
    selectedRole?.name === 'super_admin' || selectedRole?.name === 'chairman';

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
  };

  const openReject = (account: PendingAccount) => {
    setRejectTarget(account);
    setRejectReason('');
  };

  const handleApprove = async () => {
    if (!approveTarget || !selectedRoleId) return;
    try {
      await approve.mutateAsync({ profileId: approveTarget.id, roleId: selectedRoleId });
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
        <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isRefetching}>
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
            <Label htmlFor="approve-role">Role</Label>
            <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
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

            {selectedRole?.description && (
              <p className="text-sm text-muted-foreground">{selectedRole.description}</p>
            )}

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
            <Button onClick={handleApprove} disabled={!selectedRoleId || approve.isPending}>
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
              {rejectTarget?.full_name} ({rejectTarget?.email}) will be signed out and shown the
              reason you give below.
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
