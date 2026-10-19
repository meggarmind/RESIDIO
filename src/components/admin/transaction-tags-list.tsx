'use client';

import { useState } from 'react';
import {
  useTransactionTags,
  useCreateTransactionTag,
  useUpdateTransactionTag,
  useDeleteTransactionTag,
  useDeleteTransactionTags,
} from '@/hooks/use-reference';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Plus, Loader2, Pencil, Trash2, X, Tags } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { ActiveStatusBadge } from '@/components/settings/settings-states';
import { CrudTable } from '@/components/settings/crud-table';
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
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.SETTINGS_MANAGE_REFERENCE);
  const [typeFilter, setTypeFilter] = useState<string>(ALL_VALUE);
  const { data: tagsData, isLoading } = useTransactionTags({
    transaction_type: typeFilter === ALL_VALUE ? undefined : (typeFilter as TransactionTagType),
    include_inactive: true,
  });
  const createMutation = useCreateTransactionTag();
  const updateMutation = useUpdateTransactionTag();
  const deleteMutation = useDeleteTransactionTag();
  const bulkDeleteMutation = useDeleteTransactionTags();

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

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
  const [formKeywords, setFormKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState('');

  const isEditing = editingId !== null;

  const resetForm = () => {
    setEditingId(null);
    setFormName('');
    setFormType('credit');
    setFormDescription('');
    setFormColor('gray');
    setFormIsActive(true);
    setFormSortOrder(0);
    setFormKeywords([]);
    setNewKeyword('');
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
    setFormKeywords(tag.keywords || []);
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
            keywords: formKeywords,
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
          keywords: formKeywords,
        });
        setIsDialogOpen(false);
        resetForm();
      }
    } catch {
      // Error already handled by mutation hook
    } finally {
      setIsSubmitting(false);
    }
  };

  const addKeyword = () => {
    const keyword = newKeyword.trim().toLowerCase();
    if (keyword && !formKeywords.includes(keyword)) {
      setFormKeywords([...formKeywords, keyword]);
      setNewKeyword('');
    }
  };

  const removeKeyword = (keywordToRemove: string) => {
    setFormKeywords(formKeywords.filter((k) => k !== keywordToRemove));
  };

  const handleKeywordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addKeyword();
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

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    await bulkDeleteMutation.mutateAsync(selectedIds);
    setBulkDeleteDialogOpen(false);
    setSelectedIds([]);
  };

  return (
    <div className="space-y-4">
      <CrudTable
        title="Transaction Tags"
        headerExtra={
          <Tabs value={typeFilter} onValueChange={setTypeFilter}>
            <TabsList>
              <TabsTrigger value={ALL_VALUE}>All</TabsTrigger>
              <TabsTrigger value="credit">Credit</TabsTrigger>
              <TabsTrigger value="debit">Debit</TabsTrigger>
            </TabsList>
          </Tabs>
        }
        toolbar={selectedIds.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            className="min-h-11 md:min-h-8"
            onClick={() => setBulkDeleteDialogOpen(true)}
            disabled={bulkDeleteMutation.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Selected ({selectedIds.length})
          </Button>
        )}
        addLabel="Add Tag"
        onAdd={openCreateDialog}
        canManage={canManage}
        rows={tagsData}
        rowLabel={(tag) => `tag ${tag.name}`}
        isLoading={isLoading}
        selection={{ selectedIds, onChange: setSelectedIds }}
        columns={[
          { header: 'Name', cell: (tag) => <Badge className={colorVariants[tag.color]}>{tag.name}</Badge> },
          {
            header: 'Type',
            cell: (tag) => (
              <Badge variant={tag.transaction_type === 'credit' ? 'default' : 'secondary'}>
                {tag.transaction_type === 'credit' ? 'Credit' : 'Debit'}
              </Badge>
            ),
          },
          {
            header: 'Keywords',
            cell: (tag) =>
              tag.keywords && tag.keywords.length > 0 ? (
                <span className="text-sm text-muted-foreground">
                  {tag.keywords.length} keyword{tag.keywords.length !== 1 ? 's' : ''}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground/50">-</span>
              ),
          },
          { header: 'Description', cell: (tag) => tag.description || '-', className: 'text-muted-foreground' },
          { header: 'Order', cell: (tag) => tag.sort_order, className: 'w-[80px] font-mono text-sm' },
          { header: 'Status', cell: (tag) => <ActiveStatusBadge active={tag.is_active} />, className: 'w-[100px]' },
        ]}
        actions={[
          { icon: Pencil, label: 'Edit', onClick: openEditDialog },
          { icon: Trash2, label: 'Delete', onClick: openDeleteDialog, disabled: deleteMutation.isPending, destructive: true },
        ]}
        empty={{
          icon: Tags,
          title: 'No transaction tags yet',
          description: 'Tags classify imported bank transactions by keyword.',
        }}
      />

      {canManage && (
          <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
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
                  <div className="grid grid-cols-4 items-start gap-4">
                    <Label htmlFor="keywords" className="text-right pt-2">
                      Keywords
                    </Label>
                    <div className="col-span-3 space-y-2">
                      <div className="flex gap-2">
                        <Input
                          id="keywords"
                          value={newKeyword}
                          onChange={(e) => setNewKeyword(e.target.value)}
                          onKeyDown={handleKeywordKeyDown}
                          placeholder="Add keyword for auto-tagging"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addKeyword}
                          disabled={!newKeyword.trim()}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      {formKeywords.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {formKeywords.map((keyword) => (
                            <Badge
                              key={keyword}
                              variant="secondary"
                              className="flex items-center gap-1 pr-1"
                            >
                              {keyword}
                              <button
                                type="button"
                                onClick={() => removeKeyword(keyword)}
                                aria-label={`Remove keyword ${keyword}`}
                                className="ml-1 rounded-full hover:bg-muted p-0.5"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Keywords are matched against transaction descriptions for auto-tagging.
                      </p>
                    </div>
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
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transaction Tag</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{tagToDelete?.name}&quot;? This action cannot be undone.
              {tagToDelete && (
                <span className="block mt-2 text-sm text-warning">
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

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Tags</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.length} selected tags? This action cannot be undone.
              <span className="block mt-2 text-sm text-warning">
                Note: Tags currently in use by transactions cannot be deleted.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBulkDeleteDialogOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
