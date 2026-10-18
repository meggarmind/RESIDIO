'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { TagChips, TagPicker } from './tag-chips';
import {
  useDocuments,
  useDocumentTags,
  useDocumentCustomFields,
  useDocumentTaxonomy,
  useSetDocumentTags,
  useSetDocumentCustomFieldValue,
} from '@/hooks/use-documents';
import { readTypedValue } from '@/lib/documents/taxonomy';
import { formatCurrency } from '@/lib/utils';
import { Check, ListChecks, X } from 'lucide-react';
import { toast } from 'sonner';
import type { DocumentCustomField, DocumentCustomFieldValue } from '@/types/database';

interface DocumentTaxonomyCardProps {
  documentId: string;
  canEdit: boolean;
}

/** Tags and custom-field values on the document detail page (#382). Shared by every version. */
export function DocumentTaxonomyCard({ documentId, canEdit }: DocumentTaxonomyCardProps) {
  const { data: taxonomy, isLoading } = useDocumentTaxonomy(documentId);
  const { data: tags = [] } = useDocumentTags();
  const { data: fields = [] } = useDocumentCustomFields();
  const setTags = useSetDocumentTags();

  const tagIds = taxonomy?.tag_ids ?? [];
  const assigned = tags.filter((t) => tagIds.includes(t.id));

  const handleTagsChange = async (next: string[]) => {
    try {
      await setTags.mutateAsync({ documentId, tagIds: next });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update tags');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="h-5 w-5" />
          Tags &amp; Fields
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Tags</h4>
              {canEdit ? (
                <TagPicker tags={tags} value={tagIds} onChange={handleTagsChange} disabled={setTags.isPending} />
              ) : assigned.length > 0 ? (
                <TagChips tags={assigned} max={assigned.length} />
              ) : (
                <p className="text-sm text-muted-foreground italic">No tags</p>
              )}
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Custom Fields</h4>
              {fields.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No custom fields defined</p>
              ) : (
                fields.map((field) => {
                  const stored = taxonomy?.values.find((v) => v.field_id === field.id) ?? null;
                  return (
                    // Keyed on the stored row's version so the draft resets to fresh server data after a save
                    <CustomFieldRow
                      key={`${field.id}:${stored?.updated_at ?? 'empty'}`}
                      documentId={documentId}
                      field={field}
                      stored={stored}
                      canEdit={canEdit}
                    />
                  );
                })
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CustomFieldRow({
  documentId,
  field,
  stored,
  canEdit,
}: {
  documentId: string;
  field: DocumentCustomField;
  stored: DocumentCustomFieldValue | null;
  canEdit: boolean;
}) {
  const saveValue = useSetDocumentCustomFieldValue();
  const current = stored ? readTypedValue(field.data_type, stored) : null;
  const [draft, setDraft] = useState(current === null ? '' : String(current));

  const save = async (value: string | number | boolean | null) => {
    try {
      await saveValue.mutateAsync({ documentId, fieldId: field.id, value });
      toast.success(`${field.name} saved`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to save ${field.name}`);
    }
  };

  const inputId = `custom-field-${field.id}`;

  if (!canEdit) {
    return (
      <div className="flex items-start justify-between gap-4 text-sm">
        <span className="text-muted-foreground">{field.name}</span>
        <span className="text-right break-all">
          <DisplayValue field={field} value={current} />
        </span>
      </div>
    );
  }

  if (field.data_type === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={inputId}>{field.name}</Label>
        <Switch
          id={inputId}
          checked={current === true}
          disabled={saveValue.isPending}
          onCheckedChange={(checked) => save(checked)}
        />
      </div>
    );
  }

  if (field.data_type === 'document_link') {
    return <DocumentLinkRow documentId={documentId} field={field} current={current} onSave={save} />;
  }

  const dirty = draft !== (current === null ? '' : String(current));

  return (
    <div className="space-y-1">
      <Label htmlFor={inputId}>{field.name}</Label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          type={field.data_type === 'date' ? 'date' : field.data_type === 'number' || field.data_type === 'money' ? 'number' : field.data_type === 'url' ? 'url' : 'text'}
          step={field.data_type === 'money' ? '0.01' : undefined}
          placeholder={field.data_type === 'url' ? 'https://' : undefined}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        {dirty && (
          <Button type="button" size="icon" variant="outline" aria-label={`Save ${field.name}`} disabled={saveValue.isPending} onClick={() => save(draft.trim() || null)}>
            <Check className="h-4 w-4" />
          </Button>
        )}
        {!dirty && current !== null && (
          <Button type="button" size="icon" variant="ghost" aria-label={`Clear ${field.name}`} disabled={saveValue.isPending} onClick={() => save(null)}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function DocumentLinkRow({
  documentId,
  field,
  current,
  onSave,
}: {
  documentId: string;
  field: DocumentCustomField;
  current: unknown;
  onSave: (value: string | null) => void;
}) {
  // shortcut: offers the 100 newest documents; switch to a server-side search if the library outgrows it.
  const { data } = useDocuments({ limit: 100 });
  const options = (data?.data ?? [])
    .filter((d) => d.id !== documentId)
    .map((d) => ({ value: d.id, label: d.title, description: d.file_name }));

  return (
    <div className="space-y-1">
      <Label>{field.name}</Label>
      <div className="flex gap-2">
        <SearchableSelect
          options={options}
          value={typeof current === 'string' ? current : undefined}
          onValueChange={(value) => onSave(value)}
          placeholder="Link a document"
          searchPlaceholder="Search documents..."
          emptyMessage="No documents found."
          className="flex-1"
        />
        {typeof current === 'string' && (
          <Button type="button" size="icon" variant="ghost" aria-label={`Clear ${field.name}`} onClick={() => onSave(null)}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function DisplayValue({ field, value }: { field: DocumentCustomField; value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">-</span>;
  switch (field.data_type) {
    case 'boolean':
      return <>{value ? 'Yes' : 'No'}</>;
    case 'money':
      return <>{formatCurrency(Number(value))}</>;
    case 'url':
      return (
        <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-primary underline">
          {String(value)}
        </a>
      );
    case 'document_link':
      return (
        <Link href={`/documents/${String(value)}`} className="text-primary underline">
          Linked document
        </Link>
      );
    default:
      return <>{String(value)}</>;
  }
}
