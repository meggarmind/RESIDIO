'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Eye, EyeOff, Key, Shield, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  getBankAccountsWithPasswordStatus,
  setBankAccountPassword,
  removeBankAccountPassword,
  type BankAccountWithPassword,
} from '@/actions/email-imports/bank-passwords';

export function BankPasswordsSection() {
  const queryClient = useQueryClient();
  const [selectedAccount, setSelectedAccount] = useState<BankAccountWithPassword | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['bank-accounts-passwords'],
    queryFn: async () => {
      const result = await getBankAccountsWithPasswordStatus();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });

  const setPasswordMutation = useMutation({
    mutationFn: async (params: { bankAccountId: string; password: string }) => {
      const result = await setBankAccountPassword(params.bankAccountId, params.password);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success('Password saved successfully');
      queryClient.invalidateQueries({ queryKey: ['bank-accounts-passwords'] });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save password');
    },
  });

  const removePasswordMutation = useMutation({
    mutationFn: async (bankAccountId: string) => {
      const result = await removeBankAccountPassword(bankAccountId);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success('Password removed');
      queryClient.invalidateQueries({ queryKey: ['bank-accounts-passwords'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove password');
    },
  });

  const handleOpenDialog = (account: BankAccountWithPassword) => {
    setSelectedAccount(account);
    setPassword('');
    setShowPassword(false);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setSelectedAccount(null);
    setPassword('');
    setShowPassword(false);
    setIsDialogOpen(false);
  };

  const handleSavePassword = () => {
    if (!selectedAccount || !password.trim()) {
      toast.error('Please enter a password');
      return;
    }
    setPasswordMutation.mutate({
      bankAccountId: selectedAccount.id,
      password: password.trim(),
    });
  };

  // Show all bank accounts
  const allAccounts = accounts || [];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            PDF Statement Passwords
          </CardTitle>
          <CardDescription>
            Set passwords for password-protected bank statement PDFs. These are encrypted at rest.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-4 text-muted-foreground">Loading accounts...</div>
          ) : !allAccounts || allAccounts.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              No bank accounts found. Add bank accounts first.
            </div>
          ) : (
            <div className="space-y-4">
              {allAccounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <Key className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{account.account_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {account.bank_name} • ****{account.account_number.slice(-4)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {account.has_password ? (
                      <>
                        <Badge variant="secondary">
                          <Shield className="h-3 w-3 mr-1" />
                          Password Set
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDialog(account)}
                        >
                          Update
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm('Remove password for this account?')) {
                              removePasswordMutation.mutate(account.id);
                            }
                          }}
                          disabled={removePasswordMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => handleOpenDialog(account)}>
                        <Key className="h-4 w-4 mr-2" />
                        Set Password
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Set Password Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedAccount?.has_password ? 'Update' : 'Set'} PDF Password
            </DialogTitle>
            <DialogDescription>
              Enter the password used to open PDF statements from {selectedAccount?.bank_name}.
              This is typically your account number or a custom password set by the bank.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Account</Label>
              <p className="text-sm text-muted-foreground">
                {selectedAccount?.account_name} (****{selectedAccount?.account_number.slice(-4)})
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter PDF password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Password is encrypted using AES-256-GCM before storage.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSavePassword}
              disabled={setPasswordMutation.isPending || !password.trim()}
            >
              {setPasswordMutation.isPending ? 'Saving...' : 'Save Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
