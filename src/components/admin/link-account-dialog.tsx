'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2,
  Search,
  Link2,
  AlertTriangle,
  User,
  Calendar,
  CheckCircle2,
} from 'lucide-react';
import { useSearchAuthAccounts, useLinkAuthAccount } from '@/hooks/use-auth-accounts';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import type { AuthAccountSearchResult } from '@/actions/auth/link-account';

interface LinkAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  residentId: string;
  residentName: string;
  residentEmail?: string | null;
  onSuccess?: () => void;
}

export function LinkAccountDialog({
  open,
  onOpenChange,
  residentId,
  residentName,
  residentEmail,
  onSuccess,
}: LinkAccountDialogProps) {
  const [searchQuery, setSearchQuery] = useState(residentEmail || '');
  const [debouncedQuery] = useDebouncedValue(searchQuery, 300);
  const [selectedAccount, setSelectedAccount] = useState<AuthAccountSearchResult | null>(null);
  const [showRelinkConfirm, setShowRelinkConfirm] = useState(false);

  const { data: accounts, isLoading: isSearching } = useSearchAuthAccounts(debouncedQuery);
  const linkAccount = useLinkAuthAccount();

  const handleSelectAccount = (account: AuthAccountSearchResult) => {
    setSelectedAccount(account);
    if (account.linked_resident_id) {
      // Account is already linked, show warning
      setShowRelinkConfirm(true);
    } else {
      // Proceed with linking
      handleLink(account, false);
    }
  };

  const handleLink = async (account: AuthAccountSearchResult, forceRelink: boolean) => {
    try {
      await linkAccount.mutateAsync({
        authUserId: account.id,
        residentId,
        forceRelink,
      });
      onOpenChange(false);
      setSearchQuery('');
      setSelectedAccount(null);
      onSuccess?.();
    } catch {
      // Error handled by mutation
    }
  };

  const handleConfirmRelink = () => {
    if (selectedAccount) {
      handleLink(selectedAccount, true);
    }
    setShowRelinkConfirm(false);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Link Account to Resident
            </DialogTitle>
            <DialogDescription>
              Search for an existing auth account to link to{' '}
              <span className="font-medium">{residentName}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Search Input */}
            <div className="space-y-2">
              <Label htmlFor="email-search">Search by Email</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email-search"
                  placeholder="Enter email address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Search Results */}
            <div className="space-y-2">
              <Label>Available Accounts</Label>
              <ScrollArea className="h-[250px] border rounded-md">
                {isSearching ? (
                  <div className="flex items-center justify-center h-full py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !debouncedQuery || debouncedQuery.length < 3 ? (
                  <div className="flex flex-col items-center justify-center h-full py-8 text-center text-muted-foreground">
                    <Search className="h-8 w-8 mb-2" />
                    <p className="text-sm">Enter at least 3 characters to search</p>
                  </div>
                ) : accounts?.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-8 text-center text-muted-foreground">
                    <User className="h-8 w-8 mb-2" />
                    <p className="text-sm">No accounts found</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-2">
                    {accounts?.map((account) => (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => handleSelectAccount(account)}
                        disabled={linkAccount.isPending}
                        className="w-full text-left p-3 border rounded-lg hover:bg-accent/50 transition-colors disabled:opacity-50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1 flex-1 min-w-0">
                            <p className="font-medium truncate">{account.email}</p>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Created: {formatDate(account.created_at)}
                              </span>
                              <span>Last login: {formatDate(account.last_sign_in_at)}</span>
                            </div>
                          </div>
                          <div className="shrink-0">
                            {account.linked_resident_id ? (
                              <Badge variant="outline" className="text-amber-600 border-amber-300">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Linked
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-green-600 border-green-300">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Available
                              </Badge>
                            )}
                          </div>
                        </div>
                        {account.linked_resident_name && (
                          <p className="text-xs text-amber-600 mt-1">
                            Currently linked to: {account.linked_resident_name}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Relink Confirmation Dialog */}
      <AlertDialog open={showRelinkConfirm} onOpenChange={setShowRelinkConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Account Already Linked
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                This account is currently linked to{' '}
                <span className="font-medium">{selectedAccount?.linked_resident_name}</span>.
              </p>
              <p>
                Proceeding will unlink it from that resident and link it to{' '}
                <span className="font-medium">{residentName}</span> instead.
              </p>
              <p className="text-amber-600 font-medium">
                The previous resident will no longer be able to access the portal with this account.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={linkAccount.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRelink}
              disabled={linkAccount.isPending}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {linkAccount.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Relinking...
                </>
              ) : (
                'Proceed with Relink'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
