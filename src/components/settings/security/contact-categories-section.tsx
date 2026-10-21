'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { formatDayCount } from '@/lib/utils';
import {
  useSecurityContactCategories,
  useUpdateSecurityContactCategory,
  useToggleCategoryActive,
} from '@/hooks/use-security';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';
import { SettingsSkeleton } from '@/components/settings/settings-states';

/** Contact categories. Edit and the active switch act at once, so the section is instant. */
export function ContactCategoriesSection() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.SECURITY_MANAGE_CATEGORIES);
  const { data: categories, isLoading } = useSecurityContactCategories();
  const updateCategory = useUpdateSecurityContactCategory();
  const toggleActive = useToggleCategoryActive();

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    default_validity_days: 30,
    max_validity_days: 90,
  });

  const handleUpdateCategory = () => {
    if (!editingCategoryId) return;
    updateCategory.mutate({
      id: editingCategoryId,
      default_validity_days: categoryForm.default_validity_days,
      max_validity_days: categoryForm.max_validity_days,
    }, {
      onSuccess: () => {
        setEditingCategoryId(null);
        toast.success('Category updated');
      },
    });
  };

  return (
    <>
      <SettingsSection
        id="contact-categories"
        title="Contact categories"
        summary={
          isLoading
            ? 'Loading contact categories'
            : `${categories?.filter((cat) => cat.is_active).length ?? 0} of ${categories?.length ?? 0} active`
        }
        permissions={[PERMISSIONS.SECURITY_MANAGE_CATEGORIES]}
        instant
      >
        <SettingsRow rowId="contact-category-rules" stacked>
          <div className="w-full">
          {isLoading ? (
            <SettingsSkeleton />
          ) : (
            <Table stack>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Default Validity</TableHead>
                  <TableHead>Max Validity</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories?.map((cat) => (
                  <TableRow key={cat.id}>
                    <TableCell label="Category" className="font-medium">{cat.name}</TableCell>
                    <TableCell label="Default Validity">{formatDayCount(cat.default_validity_days)}</TableCell>
                    <TableCell label="Max Validity">{formatDayCount(cat.max_validity_days)}</TableCell>
                    <TableCell label="Status">
                      <Badge variant={cat.is_active ? 'default' : 'outline'}>
                        {cat.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    {canManage && (
                    <TableCell label="Actions" className="text-right">
                      <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-11 md:size-8"
                        aria-label={`Edit ${cat.name}`}
                        onClick={() => {
                          setEditingCategoryId(cat.id);
                          setCategoryForm({
                            default_validity_days: cat.default_validity_days,
                            max_validity_days: cat.max_validity_days,
                          });
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Switch
                        checked={cat.is_active}
                        onCheckedChange={() => toggleActive.mutate(cat.id)}
                        disabled={toggleActive.isPending}
                        aria-label={`${cat.name} active`}
                      />
                      </div>
                    </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          </div>
        </SettingsRow>
      </SettingsSection>

      <Dialog open={!!editingCategoryId} onOpenChange={(open) => !open && setEditingCategoryId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
            <DialogDescription>
              Configure validity period and limits for this contact category.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="default_validity_days">Default Validity (Days)</Label>
              <Input
                id="default_validity_days"
                type="number"
                min={1}
                value={categoryForm.default_validity_days}
                onChange={(e) => setCategoryForm(prev => ({ ...prev, default_validity_days: parseInt(e.target.value) || 1 }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_validity_days">Maximum Validity (Days)</Label>
              <Input
                id="max_validity_days"
                type="number"
                min={1}
                value={categoryForm.max_validity_days}
                onChange={(e) => setCategoryForm(prev => ({ ...prev, max_validity_days: parseInt(e.target.value) || 1 }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCategoryId(null)}>Cancel</Button>
            <Button onClick={handleUpdateCategory} disabled={updateCategory.isPending}>
              {updateCategory.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
