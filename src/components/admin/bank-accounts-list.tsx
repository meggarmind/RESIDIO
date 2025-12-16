'use client';

import { useState } from 'react';
import {
  useBankAccounts,
  useCreateBankAccount,
  useUpdateBankAccount,
  useDeleteBankAccount,
} from '@/hooks/use-imports';
import { useCanAutoApprove } from '@/hooks/use-approvals';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  DialogTrigger,
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Loader2, Pencil, Trash2, CheckCircle, Clock, Info } from 'lucide-react';
import type { EstateBankAccount } from '@/types/database';

type StatusFilter = 'all' | 'active' | 'inactive';

export function BankAccountsList() {
  // Filter state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const includeInactive = statusFilter === 'all' || statusFilter === 'inactive';

  // Data queries
  const { data: accountsData, isLoading, refetch } = useBankAccounts(includeInactive);
  const { data: canAutoApprove, isLoading: isLoadingPermission } = useCanAutoApprove();

  // Mutations
  const createMutation = useCreateBankAccount();
  const updateMutation = useUpdateBankAccount();
  const deleteMutation = useDeleteBankAccount();

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<EstateBankAccount | null>(null);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formAccountNumber, setFormAccountNumber] = useState('');
  const [formAccountName, setFormAccountName] = useState('');
  const [formBankName, setFormBankName] = useState('FirstBank');
  const [formDescription, setFormDescription] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  const isEditing = editingId !== null;

  // Filter accounts based on status
  const filteredAccounts = accountsData?.data?.filter((account) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'active') return account.is_active;
    if (statusFilter === 'inactive') return !account.is_active;
    return true;
  }) || [];

  const resetForm = () => {
    setEditingId(null);
    setFormAccountNumber('');
    setFormAccountName('');
    setFormBankName('FirstBank');
    setFormDescription('');
    setFormIsActive(true);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (account: EstateBankAccount) => {
    setEditingId(account.id);
    setFormAccountNumber(account.account_number);
    setFormAccountName(account.account_name);
    setFormBankName(account.bank_name);
    setFormDescription(account.description || '');
    setFormIsActive(account.is_active);
    setIsDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      resetForm();
    }
    setIsDialogOpen(open);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAccountNumber.trim() || !formAccountName.trim() || !formBankName.trim()) return;

    setIsSubmitting(true);
    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          id: editingId!,
          data: {
            account_number: formAccountNumber,
            account_name: formAccountName,
            bank_name: formBankName,
            description: formDescription || undefined,
            is_active: formIsActive,
          },
        });
      } else {
        await createMutation.mutateAsync({
          account_number: formAccountNumber,
          account_name: formAccountName,
          bank_name: formBankName,
          description: formDescription || undefined,
          is_active: formIsActive,
        });
      }
      setIsDialogOpen(false);
      resetForm();
    } catch {
      // Error handled by mutation hooks
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDeleteDialog = (account: EstateBankAccount) => {
    setAccountToDelete(account);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!accountToDelete) return;
    await deleteMutation.mutateAsync(accountToDelete.id);
    setDeleteDialogOpen(false);
    setAccountToDelete(null);
  };

  const truncateDescription = (desc: string | null, maxLength = 50) => {
    if (!desc) return '-';
    return desc.length > maxLength ? `${desc.substring(0, maxLength)}...` : desc;
  };

  return (
    <div className="space-y-4">
      {/* Header with filter and add button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="inactive">Inactive</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Account
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                {isEditing ? 'Edit Bank Account' : 'Add New Bank Account'}
              </DialogTitle>
              <DialogDescription>
                {isEditing
                  ? 'Update the bank account details below.'
                  : 'Add a new estate bank account for statement imports.'}
              </DialogDescription>
            </DialogHeader>

            {/* Approval indicator */}
            {!isLoadingPermission && (
              <>
                {!canAutoApprove && (
                  <Alert className="border-amber-200 bg-amber-50">
                    <Clock className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-800">
                      This change will require approval from an admin or chairman.
                    </AlertDescription>
                  </Alert>
                )}
                {canAutoApprove && (
                  <Alert className="border-green-200 bg-green-50">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">
                      This change will be applied immediately.
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}

            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="account_number" className="text-right">
                    Account No.*
                  </Label>
                  <Input
                    id="account_number"
                    value={formAccountNumber}
                    onChange={(e) => setFormAccountNumber(e.target.value.replace(/\D/g, ''))}
                    className="col-span-3"
                    placeholder="e.g. 0123456789"
                    maxLength={12}
                    required
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="account_name" className="text-right">
                    Account Name*
                  </Label>
                  <Input
                    id="account_name"
                    value={formAccountName}
                    onChange={(e) => setFormAccountName(e.target.value)}
                    className="col-span-3"
                    placeholder="e.g. Estate Maintenance Account"
                    required
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="bank_name" className="text-right">
                    Bank Name*
                  </Label>
                  <Input
                    id="bank_name"
                    value={formBankName}
                    onChange={(e) => setFormBankName(e.target.value)}
                    className="col-span-3"
                    placeholder="e.g. FirstBank"
                    required
                  />
                </div>
                <div className="grid grid-cols-4 items-start gap-4">
                  <Label htmlFor="description" className="text-right pt-2">
                    Description
                  </Label>
                  <Textarea
                    id="description"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="col-span-3"
                    placeholder="Optional notes about this account's purpose"
                    rows={3}
                    maxLength={500}
                  />
                </div>
                {isEditing && (
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="is_active" className="text-right">
                      Active
                    </Label>
                    <div className="col-span-3 flex items-center gap-2">
                      <Switch
                        id="is_active"
                        checked={formIsActive}
                        onCheckedChange={setFormIsActive}
                      />
                      <span className="text-sm text-muted-foreground">
                        {formIsActive ? 'Account is active' : 'Account is inactive'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}
                >
                  {(isSubmitting || createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isEditing ? 'Save Changes' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Info message about account number validation */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Info className="h-4 w-4" />
        <span>Account numbers must be 10-12 digits.</span>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account Name</TableHead>
              <TableHead>Account Number</TableHead>
              <TableHead>Bank</TableHead>
              <TableHead className="max-w-[200px]">Description</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredAccounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No bank accounts found.
                </TableCell>
              </TableRow>
            ) : (
              filteredAccounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.account_name}</TableCell>
                  <TableCell className="font-mono text-sm">{account.account_number}</TableCell>
                  <TableCell>{account.bank_name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                    {truncateDescription(account.description)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={account.is_active ? 'default' : 'secondary'}>
                      {account.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditDialog(account)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => openDeleteDialog(account)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bank Account</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>
                Are you sure you want to delete &quot;{accountToDelete?.account_name}&quot;?
              </span>
              {!canAutoApprove && (
                <span className="block text-amber-600">
                  This action will be submitted for approval.
                </span>
              )}
              <span className="block text-muted-foreground">
                If this account has import history, it will be deactivated instead of deleted.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAccountToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
