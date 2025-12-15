'use client';

import { useState } from 'react';
import {
  useTransactionTags,
  useCreateTransactionTag,
  useUpdateTransactionTag,
  useDeleteTransactionTag,
} from '@/hooks/use-reference';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Loader2, Pencil, Trash2 } from 'lucide-react';
import type { TransactionTag, TransactionTagType, TransactionTagColor } from '@/types/database';

const ALL_VALUE = '_all';

// Color badge variants
const colorVariants: Record<TransactionTagColor, string> = {
  gray: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  red: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

export function TransactionTagsList() {
  const [typeFilter, setTypeFilter] = useState<string>(ALL_VALUE);
  const { data: tagsData, isLoading, refetch } = useTransactionTags({
    transaction_type: typeFilter === ALL_VALUE ? undefined : (typeFilter as TransactionTagType),
    include_inactive: true,
  });
  const createMutation = useCreateTransactionTag();
  const updateMutation = useUpdateTransactionTag();
  const deleteMutation = useDeleteTransactionTag();

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<TransactionTag | null>(null);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<TransactionTagType>('credit');
  const [formDescription, setFormDescription] = useState('');
  const [formColor, setFormColor] = useState<TransactionTagColor>('gray');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formSortOrder, setFormSortOrder] = useState(0);

  const isEditing = editingId !== null;

  const resetForm = () => {
    setEditingId(null);
    setFormName('');
    setFormType('credit');
    setFormDescription('');
    setFormColor('gray');
    setFormIsActive(true);
    setFormSortOrder(0);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (tag: TransactionTag) => {
    setEditingId(tag.id);
    setFormName(tag.name);
    setFormType(tag.transaction_type);
    setFormDescription(tag.description || '');
    setFormColor(tag.color);
    setFormIsActive(tag.is_active);
    setFormSortOrder(tag.sort_order);
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
    if (!formName.trim()) return;

    setIsSubmitting(true);
    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          id: editingId!,
          data: {
            name: formName,
            transaction_type: formType,
            description: formDescription || null,
            color: formColor,
            is_active: formIsActive,
            sort_order: formSortOrder,
          },
        });
        setIsDialogOpen(false);
        resetForm();
      } else {
        await createMutation.mutateAsync({
          name: formName,
          transaction_type: formType,
          description: formDescription || null,
          color: formColor,
          is_active: formIsActive,
          sort_order: formSortOrder,
        });
        setIsDialogOpen(false);
        resetForm();
        refetch();
      }
    } catch {
      // Error already handled by mutation hook
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDeleteDialog = (tag: TransactionTag) => {
    setTagToDelete(tag);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!tagToDelete) return;
    await deleteMutation.mutateAsync(tagToDelete.id);
    setDeleteDialogOpen(false);
    setTagToDelete(null);
  };

  const filteredTags = tagsData || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-medium">Transaction Tags</h3>
          <Tabs value={typeFilter} onValueChange={setTypeFilter}>
            <TabsList>
              <TabsTrigger value={ALL_VALUE}>All</TabsTrigger>
              <TabsTrigger value="credit">Credit</TabsTrigger>
              <TabsTrigger value="debit">Debit</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Tag
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {isEditing ? 'Edit Transaction Tag' : 'Add New Transaction Tag'}
              </DialogTitle>
              <DialogDescription>
                {isEditing
                  ? 'Update the transaction tag details below.'
                  : 'Create a new tag to categorize bank transactions.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">
                    Name*
                  </Label>
                  <Input
                    id="name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="col-span-3"
                    placeholder="e.g. Rent Payment"
                    maxLength={50}
                    required
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="type" className="text-right">
                    Type*
                  </Label>
                  <Select value={formType} onValueChange={(v) => setFormType(v as TransactionTagType)}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="credit">Credit (Incoming)</SelectItem>
                      <SelectItem value="debit">Debit (Outgoing)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="description" className="text-right">
                    Description
                  </Label>
                  <Textarea
                    id="description"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="col-span-3"
                    placeholder="Optional description"
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="color" className="text-right">
                    Color
                  </Label>
                  <Select value={formColor} onValueChange={(v) => setFormColor(v as TransactionTagColor)}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select color" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gray">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-gray-500" />
                          Gray
                        </div>
                      </SelectItem>
                      <SelectItem value="blue">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-blue-500" />
                          Blue
                        </div>
                      </SelectItem>
                      <SelectItem value="green">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-green-500" />
                          Green
                        </div>
                      </SelectItem>
                      <SelectItem value="red">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-red-500" />
                          Red
                        </div>
                      </SelectItem>
                      <SelectItem value="yellow">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-yellow-500" />
                          Yellow
                        </div>
                      </SelectItem>
                      <SelectItem value="purple">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-purple-500" />
                          Purple
                        </div>
                      </SelectItem>
                      <SelectItem value="orange">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-orange-500" />
                          Orange
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="sort_order" className="text-right">
                    Sort Order
                  </Label>
                  <Input
                    id="sort_order"
                    type="number"
                    value={formSortOrder}
                    onChange={(e) => setFormSortOrder(parseInt(e.target.value) || 0)}
                    className="col-span-3"
                    min={0}
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
                        {formIsActive ? 'Tag is active' : 'Tag is inactive'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}>
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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[80px]">Order</TableHead>
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
            ) : filteredTags.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No transaction tags found.
                </TableCell>
              </TableRow>
            ) : (
              filteredTags.map((tag) => (
                <TableRow key={tag.id}>
                  <TableCell>
                    <Badge className={colorVariants[tag.color]}>{tag.name}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={tag.transaction_type === 'credit' ? 'default' : 'secondary'}>
                      {tag.transaction_type === 'credit' ? 'Credit' : 'Debit'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {tag.description || '-'}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{tag.sort_order}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        tag.is_active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                      }`}
                    >
                      {tag.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditDialog(tag)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => openDeleteDialog(tag)}
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
            <AlertDialogTitle>Delete Transaction Tag</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{tagToDelete?.name}&quot;? This action cannot be undone.
              {tagToDelete && (
                <span className="block mt-2 text-sm text-amber-600">
                  Note: If this tag is in use by any transactions, you will need to reassign them first.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTagToDelete(null)}>Cancel</AlertDialogCancel>
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
