'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TagChip } from '@/components/documents/tag-chips';
import {
  useDocumentTags,
  useSaveDocumentTag,
  useDeleteDocumentTag,
  useDocumentCustomFields,
  useSaveDocumentCustomField,
  useDeleteDocumentCustomField,
} from '@/hooks/use-documents';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { MAX_TAG_DEPTH, tagParentError, tagPathLabel } from '@/lib/documents/taxonomy';
import {
  DOCUMENT_CUSTOM_FIELD_DATA_TYPES,
  type DocumentCustomField,
  type DocumentCustomFieldDataType,
  type DocumentTag,
} from '@/types/database';
import { Plus, Pencil, Trash2, RotateCcw, Tags, ListChecks } from 'lucide-react';
import { toast } from 'sonner';

const NO_PARENT = '__none__';

const DATA_TYPE_LABELS: Record<DocumentCustomFieldDataType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  money: 'Money',
  boolean: 'Yes / No',
  url: 'Link (URL)',
  document_link: 'Linked document',
};

export default function DocumentTaxonomyPage() {
  const { hasPermission } = useAuth();
  const canManageTags = hasPermission(PERMISSIONS.DOCUMENTS_MANAGE_TAGS);
  const canManageFields = hasPermission(PERMISSIONS.DOCUMENTS_MANAGE_CUSTOM_FIELDS);

  if (!canManageTags && !canManageFields) {
    return (
      <div className="text-center py-12">
        <Tags className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">
          You don&apos;t have permission to manage document tags or custom fields.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Document Tags &amp; Fields</h1>
        <p className="text-muted-foreground">
          Classify documents with nested tags and record structured details with custom fields.
        </p>
      </div>
      {canManageTags && <TagsSection />}
      {canManageFields && <CustomFieldsSection />}
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge variant="secondary">Active</Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
  );
}

function TagsSection() {
  const { data: tags = [], isLoading } = useDocumentTags(true);
  const saveMutation = useSaveDocumentTag();
  const deleteMutation = useDeleteDocumentTag();
  const [editing, setEditing] = useState<DocumentTag | 'new' | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6b7280');
  const [parentId, setParentId] = useState(NO_PARENT);

  const editingId = editing && editing !== 'new' ? editing.id : null;
  const sorted = [...tags].sort((a, b) => tagPathLabel(tags, a.id).localeCompare(tagPathLabel(tags, b.id)));
  // Offer only parents the depth cap allows; the server re-checks.
  const parentOptions = sorted.filter((t) => t.id !== editingId && !tagParentError(tags, editingId, t.id));

  const open = (tag: DocumentTag | 'new') => {
    setEditing(tag);
    setName(tag === 'new' ? '' : tag.name);
    setColor(tag === 'new' ? '#6b7280' : tag.color);
    setParentId(tag === 'new' ? NO_PARENT : tag.parent_tag_id ?? NO_PARENT);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveMutation.mutateAsync({
        id: editingId ?? undefined,
        data: { name, color, parent_tag_id: parentId === NO_PARENT ? null : parentId },
      });
      toast.success(editingId ? 'Tag updated' : 'Tag created');
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save tag');
    }
  };

  const toggleActive = async (tag: DocumentTag) => {
    try {
      if (tag.is_active) await deleteMutation.mutateAsync(tag.id);
      else await saveMutation.mutateAsync({ id: tag.id, data: { is_active: true } });
      toast.success(tag.is_active ? 'Tag deactivated' : 'Tag reactivated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update tag');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Tags</CardTitle>
          <CardDescription>
            Tags nest up to {MAX_TAG_DEPTH} levels. Filtering the library by a tag also finds documents tagged with any tag
            under it.
          </CardDescription>
        </div>
        <Button onClick={() => open('new')}>
          <Plus className="h-4 w-4 mr-2" />
          Add Tag
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : tags.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">No tags yet</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((tag) => (
                <TableRow key={tag.id} className={!tag.is_active ? 'opacity-50' : ''}>
                  <TableCell>
                    <TagChip tag={tag} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{tagPathLabel(tags, tag.id)}</TableCell>
                  <TableCell>
                    <StatusBadge active={tag.is_active} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" aria-label={`Edit ${tag.name}`} onClick={() => open(tag)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={tag.is_active ? `Deactivate ${tag.name}` : `Reactivate ${tag.name}`}
                        onClick={() => toggleActive(tag)}
                        className={tag.is_active ? 'text-destructive hover:text-destructive' : ''}
                      >
                        {tag.is_active ? <Trash2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Tag' : 'Create Tag'}</DialogTitle>
            <DialogDescription>Choose a parent to nest this tag under another.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tag-name">Name *</Label>
              <Input id="tag-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag-color">Color</Label>
              <Input id="tag-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20 p-1" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag-parent">Parent tag</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger id="tag-parent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PARENT}>None (top level)</SelectItem>
                  {parentOptions.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {tagPathLabel(tags, t.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving...' : editingId ? 'Update Tag' : 'Create Tag'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CustomFieldsSection() {
  const { data: fields = [], isLoading } = useDocumentCustomFields(true);
  const saveMutation = useSaveDocumentCustomField();
  const deleteMutation = useDeleteDocumentCustomField();
  const [editing, setEditing] = useState<DocumentCustomField | 'new' | null>(null);
  const [name, setName] = useState('');
  const [dataType, setDataType] = useState<DocumentCustomFieldDataType>('text');

  const editingId = editing && editing !== 'new' ? editing.id : null;

  const open = (field: DocumentCustomField | 'new') => {
    setEditing(field);
    setName(field === 'new' ? '' : field.name);
    setDataType(field === 'new' ? 'text' : field.data_type);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveMutation.mutateAsync({ id: editingId ?? undefined, data: { name, data_type: dataType } });
      toast.success(editingId ? 'Field updated' : 'Field created');
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save field');
    }
  };

  const toggleActive = async (field: DocumentCustomField) => {
    try {
      if (field.is_active) await deleteMutation.mutateAsync(field.id);
      else await saveMutation.mutateAsync({ id: field.id, data: { name: field.name, is_active: true } });
      toast.success(field.is_active ? 'Field deactivated' : 'Field reactivated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update field');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Custom Fields</CardTitle>
          <CardDescription>
            Typed details recorded on each document, such as an amount, an expiry date or a related document. A field&apos;s
            type is fixed once it is created.
          </CardDescription>
        </div>
        <Button onClick={() => open('new')}>
          <Plus className="h-4 w-4 mr-2" />
          Add Field
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : fields.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">No custom fields yet</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field) => (
                <TableRow key={field.id} className={!field.is_active ? 'opacity-50' : ''}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ListChecks className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{field.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{DATA_TYPE_LABELS[field.data_type]}</TableCell>
                  <TableCell>
                    <StatusBadge active={field.is_active} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" aria-label={`Edit ${field.name}`} onClick={() => open(field)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={field.is_active ? `Deactivate ${field.name}` : `Reactivate ${field.name}`}
                        onClick={() => toggleActive(field)}
                        className={field.is_active ? 'text-destructive hover:text-destructive' : ''}
                      >
                        {field.is_active ? <Trash2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Field' : 'Create Field'}</DialogTitle>
            <DialogDescription>Values entered on documents must match the field&apos;s type.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="field-name">Name *</Label>
              <Input id="field-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="field-type">Type</Label>
              <Select
                value={dataType}
                onValueChange={(v) => setDataType(v as DocumentCustomFieldDataType)}
                disabled={!!editingId}
              >
                <SelectTrigger id="field-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CUSTOM_FIELD_DATA_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {DATA_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving...' : editingId ? 'Update Field' : 'Create Field'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
