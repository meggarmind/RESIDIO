'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  UserCircle,
  Plus,
  Loader2,
  MoreVertical,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Trash,
  Users,
} from 'lucide-react';
import {
  useResidentAliases,
  useCreatePaymentAlias,
  useUpdatePaymentAlias,
  useToggleAliasStatus,
  useDeletePaymentAlias,
} from '@/hooks/use-imports';
import { paymentAliasFormSchema, type PaymentAliasFormData } from '@/lib/validators/import';
import { toast } from 'sonner';
import type { ResidentPaymentAlias } from '@/types/database';

interface PaymentAliasesProps {
  residentId: string;
  residentName: string;
}

export function PaymentAliases({ residentId, residentName }: PaymentAliasesProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedAlias, setSelectedAlias] = useState<ResidentPaymentAlias | null>(null);

  const { data: aliasesData, isLoading, refetch } = useResidentAliases(residentId);
  const createMutation = useCreatePaymentAlias();
  const updateMutation = useUpdatePaymentAlias();
  const toggleMutation = useToggleAliasStatus();
  const deleteMutation = useDeletePaymentAlias();

  const aliases = aliasesData?.data || [];

  const addForm = useForm<PaymentAliasFormData>({
    resolver: zodResolver(paymentAliasFormSchema),
    defaultValues: {
      resident_id: residentId,
      alias_name: '',
      notes: '',
      is_active: true,
    },
  });

  const editForm = useForm<PaymentAliasFormData>({
    resolver: zodResolver(paymentAliasFormSchema),
    defaultValues: {
      resident_id: residentId,
      alias_name: '',
      notes: '',
      is_active: true,
    },
  });

  const handleAdd = async (data: PaymentAliasFormData) => {
    try {
      await createMutation.mutateAsync(data);
      setShowAddDialog(false);
      addForm.reset({
        resident_id: residentId,
        alias_name: '',
        notes: '',
        is_active: true,
      });
      refetch();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleEdit = async (data: PaymentAliasFormData) => {
    if (!selectedAlias) return;

    try {
      await updateMutation.mutateAsync({
        id: selectedAlias.id,
        data: {
          alias_name: data.alias_name,
          notes: data.notes,
          is_active: data.is_active,
        },
      });
      setShowEditDialog(false);
      setSelectedAlias(null);
      refetch();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleToggleStatus = async (aliasId: string) => {
    try {
      await toggleMutation.mutateAsync(aliasId);
      refetch();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleDelete = async () => {
    if (!selectedAlias) return;

    try {
      await deleteMutation.mutateAsync(selectedAlias.id);
      setShowDeleteDialog(false);
      setSelectedAlias(null);
      refetch();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const openEditDialog = (alias: ResidentPaymentAlias) => {
    setSelectedAlias(alias);
    editForm.reset({
      resident_id: residentId,
      alias_name: alias.alias_name,
      notes: alias.notes || '',
      is_active: alias.is_active,
    });
    setShowEditDialog(true);
  };

  const openDeleteDialog = (alias: ResidentPaymentAlias) => {
    setSelectedAlias(alias);
    setShowDeleteDialog(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Payment Aliases
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Payment Aliases
            </CardTitle>
            <CardDescription>
              Alternative names that may appear on bank transfers for this resident
            </CardDescription>
          </div>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Alias
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {aliases.length > 0 ? (
          <div className="space-y-3">
            {aliases.map((alias: ResidentPaymentAlias) => (
              <div
                key={alias.id}
                className={`flex items-start justify-between p-4 border rounded-lg ${
                  !alias.is_active ? 'bg-muted/50 opacity-70' : ''
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <UserCircle className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{alias.alias_name}</span>
                    <Badge variant={alias.is_active ? 'default' : 'secondary'}>
                      {alias.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  {alias.notes && (
                    <p className="text-sm text-muted-foreground pl-6">{alias.notes}</p>
                  )}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEditDialog(alias)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleToggleStatus(alias.id)}
                      disabled={toggleMutation.isPending}
                    >
                      {alias.is_active ? (
                        <>
                          <ToggleLeft className="h-4 w-4 mr-2" />
                          Deactivate
                        </>
                      ) : (
                        <>
                          <ToggleRight className="h-4 w-4 mr-2" />
                          Activate
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => openDeleteDialog(alias)}
                    >
                      <Trash className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground mb-1">No payment aliases</p>
            <p className="text-sm text-muted-foreground">
              Add aliases for names that may appear on bank transfers from {residentName}
            </p>
            <Button variant="outline" className="mt-4" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add First Alias
            </Button>
          </div>
        )}
      </CardContent>

      {/* Add Alias Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Payment Alias</DialogTitle>
            <DialogDescription>
              Add an alternative name that may appear on bank transfers for {residentName}.
              This helps with automatic payment matching.
            </DialogDescription>
          </DialogHeader>
          <Form {...addForm}>
            <form onSubmit={addForm.handleSubmit(handleAdd)} className="space-y-4">
              <FormField
                control={addForm.control}
                name="alias_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alias Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Jane Doe, Doe Enterprises Ltd" {...field} />
                    </FormControl>
                    <FormDescription>
                      The name as it appears on bank statements
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={addForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g., Wife's account, Company account"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={addForm.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Active</FormLabel>
                      <FormDescription>
                        Active aliases are used for payment matching
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddDialog(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Add Alias
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Alias Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Payment Alias</DialogTitle>
            <DialogDescription>
              Update the alias details for {residentName}.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEdit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="alias_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alias Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Jane Doe, Doe Enterprises Ltd" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g., Wife's account, Company account"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Active</FormLabel>
                      <FormDescription>
                        Active aliases are used for payment matching
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEditDialog(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Alias</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the alias &quot;{selectedAlias?.alias_name}&quot;?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Alias
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
