'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Users, Loader2, Edit } from 'lucide-react';
import { toast } from 'sonner';
import {
  useSecurityContactCategories,
  useUpdateSecurityContactCategory,
  useToggleCategoryActive,
} from '@/hooks/use-security';

export default function CategoriesPage() {
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
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Contact Categories</h3>
        <p className="text-sm text-muted-foreground">
          Manage contact type categories, their validity periods, and usage requirements.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <Users className="inline-block mr-2 h-4 w-4" />
            Contact Categories
          </CardTitle>
          <CardDescription>
            Configure validity periods and limits for each contact category.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Validity (Days)</TableHead>
                  <TableHead>Max Contacts</TableHead>
                  <TableHead>Warning (Days)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories?.map((cat) => (
                  <TableRow key={cat.id}>
                    <TableCell className="font-medium">{cat.name}</TableCell>
                    <TableCell>{cat.default_validity_days} days</TableCell>
                    <TableCell>{cat.max_validity_days} days</TableCell>
                    <TableCell>
                      <Badge variant={cat.is_active ? 'default' : 'outline'}>
                        {cat.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
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
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
    </div>
  );
}
