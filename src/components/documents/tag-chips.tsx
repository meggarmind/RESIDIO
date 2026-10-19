'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Check, Tags, X } from 'lucide-react';
import { tagPathLabel } from '@/lib/documents/taxonomy';
import type { DocumentTag } from '@/types/database';

type ChipTag = Pick<DocumentTag, 'id' | 'name' | 'color'>;

export function TagChip({ tag, onRemove }: { tag: ChipTag; onRemove?: () => void }) {
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} aria-hidden />
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 rounded-sm opacity-60 hover:opacity-100"
          aria-label={`Remove tag ${tag.name}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </Badge>
  );
}

export function TagChips({ tags, max = 3 }: { tags: ChipTag[] | undefined; max?: number }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, max).map((tag) => (
        <TagChip key={tag.id} tag={tag} />
      ))}
      {tags.length > max && (
        <Badge variant="outline" className="font-normal text-muted-foreground">
          +{tags.length - max}
        </Badge>
      )}
    </div>
  );
}

interface TagPickerProps {
  tags: DocumentTag[];
  value: string[];
  onChange: (tagIds: string[]) => void;
  disabled?: boolean;
}

/** Multi-select over active tags, labelled with their full path. */
export function TagPicker({ tags, value, onChange, disabled }: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const active = tags.filter((t) => t.is_active);
  const selected = active.filter((t) => value.includes(t.id));
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((tag) => (
            <TagChip key={tag.id} tag={tag} onRemove={disabled ? undefined : () => toggle(tag.id)} />
          ))}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={disabled || active.length === 0}>
            <Tags className="h-4 w-4 mr-2" />
            {active.length === 0 ? 'No tags defined' : 'Choose tags'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-72" align="start">
          <Command>
            <CommandInput placeholder="Search tags..." />
            <CommandList>
              <CommandEmpty>No tags found.</CommandEmpty>
              <CommandGroup>
                {active.map((tag) => {
                  const label = tagPathLabel(tags, tag.id);
                  return (
                    <CommandItem key={tag.id} value={label} onSelect={() => toggle(tag.id)}>
                      <Check className={`h-4 w-4 mr-2 ${value.includes(tag.id) ? 'opacity-100' : 'opacity-0'}`} />
                      <span className="h-2 w-2 rounded-full mr-2 shrink-0" style={{ backgroundColor: tag.color }} aria-hidden />
                      <span className="truncate">{label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
