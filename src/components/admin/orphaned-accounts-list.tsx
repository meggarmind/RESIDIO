'use client';

import { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Loader2,
  Search,
  User,
  Calendar,
  Link2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useOrphanedAuthAccounts } from '@/hooks/use-auth-accounts';
import type { OrphanedAuthAccount } from '@/actions/auth/link-account';

export function OrphanedAccountsList() {
  const { data: accounts, isLoading, error, refetch, isRefetching } = useOrphanedAuthAccounts();
  const [searchFilter, setSearchFilter] = useState('');
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<OrphanedAuthAccount | null>(null);

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

  const filteredAccounts = accounts?.filter((account) =>
    account.email.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const handleLinkAccount = (account: OrphanedAuthAccount) => {
    setSelectedAccount(account);
    setLinkDialogOpen(true);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h3 className="font-semibold text-lg">Failed to Load Accounts</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {error instanceof Error ? error.message : 'An error occurred'}
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with search and refresh */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter by email..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
        >
          {isRefetching ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      {/* Stats */}
      {accounts && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">
            {filteredAccounts?.length || 0} orphaned accounts
          </Badge>
          {searchFilter && (
            <span>
              (showing {filteredAccounts?.length} of {accounts.length})
            </span>
          )}
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Loading skeleton
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-5 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-20 ml-auto" />
                  </TableCell>
                </TableRow>
              ))
            ) : filteredAccounts?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8" />
                    <p>
                      {searchFilter
                        ? 'No accounts match your search'
                        : 'No orphaned accounts found'}
                    </p>
                    <p className="text-xs">
                      All authentication accounts are linked to residents
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredAccounts?.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <span className="font-medium">{account.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {formatDate(account.created_at)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {formatDate(account.last_sign_in_at)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {account.email_confirmed_at ? (
                      <Badge variant="outline" className="text-green-600 border-green-300">
                        Verified
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-600 border-amber-300">
                        Unverified
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleLinkAccount(account)}
                    >
                      <Link2 className="h-4 w-4 mr-2" />
                      Link
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Link Dialog - uses a temporary resident selection approach */}
      {selectedAccount && (
        <LinkToResidentDialog
          open={linkDialogOpen}
          onOpenChange={setLinkDialogOpen}
          account={selectedAccount}
          onSuccess={() => {
            refetch();
            setSelectedAccount(null);
          }}
        />
      )}
    </div>
  );
}

// A dialog specifically for linking from the orphaned account side
// (selecting a resident to link TO an account)
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLinkAuthAccount } from '@/hooks/use-auth-accounts';
import { searchResidentsForRoleAssignment } from '@/actions/roles/assign-role';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

interface LinkToResidentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: OrphanedAuthAccount;
  onSuccess?: () => void;
}

function LinkToResidentDialog({
  open,
  onOpenChange,
  account,
  onSuccess,
}: LinkToResidentDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery] = useDebouncedValue(searchQuery, 300);
  const [searchResults, setSearchResults] = useState<
    Array<{
      id: string;
      first_name: string;
      last_name: string;
      email: string | null;
      house_address: string | null;
      profile_id: string | null;
    }>
  >([]);
  const [isSearching, setIsSearching] = useState(false);

  const linkAccount = useLinkAuthAccount();

  // Search residents when query changes
  const handleSearch = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const result = await searchResidentsForRoleAssignment(query);
      if (result.data) {
        // Filter to only show residents without linked accounts
        const unlinked = result.data.filter((r) => !r.profile_id);
        setSearchResults(unlinked);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Trigger search on debounced query change
  useEffect(() => {
    if (debouncedQuery) {
      handleSearch(debouncedQuery);
    }
  }, [debouncedQuery]);

  const handleLinkToResident = async (residentId: string) => {
    try {
      await linkAccount.mutateAsync({
        authUserId: account.id,
        residentId,
      });
      onOpenChange(false);
      onSuccess?.();
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Link Account to Resident
          </DialogTitle>
          <DialogDescription>
            Search for a resident to link to{' '}
            <span className="font-medium">{account.email}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search residents by name..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                handleSearch(e.target.value);
              }}
              className="pl-9"
            />
          </div>

          {/* Search Results */}
          <ScrollArea className="h-[250px] border rounded-md">
            {isSearching ? (
              <div className="flex items-center justify-center h-full py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : searchQuery.length < 2 ? (
              <div className="flex flex-col items-center justify-center h-full py-8 text-center text-muted-foreground">
                <Search className="h-8 w-8 mb-2" />
                <p className="text-sm">Enter at least 2 characters to search</p>
                <p className="text-xs mt-1">
                  Only residents without linked accounts are shown
                </p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-8 text-center text-muted-foreground">
                <User className="h-8 w-8 mb-2" />
                <p className="text-sm">No unlinked residents found</p>
              </div>
            ) : (
              <div className="p-2 space-y-2">
                {searchResults.map((resident) => (
                  <button
                    key={resident.id}
                    type="button"
                    onClick={() => handleLinkToResident(resident.id)}
                    disabled={linkAccount.isPending}
                    className="w-full text-left p-3 border rounded-lg hover:bg-accent/50 transition-colors disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">
                          {resident.first_name} {resident.last_name}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {resident.email || resident.house_address || 'No details'}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
