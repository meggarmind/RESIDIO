'use client';

import { useState } from 'react';
import { AlertTriangle, Check, UserPlus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import type { ResidentOption } from '@/lib/residents/resident-options';

/**
 * Multi-select over residents by name; the value stays a list of resident UUIDs. Mirrors
 * TagPicker. Shared by the WhatsApp pilot list (#801) and recipient groups (#819).
 * `warnings` maps a resident ID to a short reason shown on its badge, e.g. `not opted in`.
 */
export function ResidentPicker({ options, value, onChange, disabled, error, triggerLabel = 'Choose residents', warnings }: {
  options: ResidentOption[];
  value: string[];
  onChange: (residentIds: string[]) => void;
  disabled?: boolean;
  error?: string | null;
  triggerLabel?: string;
  warnings?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const byId = new Map(options.map((option) => [option.id, option]));
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((id) => {
            // A saved ID with no matching resident (deleted, or the list failed to load) stays visible and removable.
            const label = byId.get(id)?.name ?? `Unknown resident (${id.slice(0, 8)})`;
            const warning = warnings?.[id];
            return (
              <Badge key={id} variant="outline" className={`gap-1 font-normal ${warning ? 'border-amber-500/60' : ''}`}>
                {warning && <AlertTriangle className="h-3 w-3 text-amber-600" aria-hidden="true" />}
                {warning ? `${label}: ${warning}` : label}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    className="ml-0.5 rounded-sm opacity-60 hover:opacity-100"
                    aria-label={`Remove ${label}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            );
          })}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={disabled || options.length === 0}>
            <UserPlus className="h-4 w-4 mr-2" />
            {options.length === 0 ? 'No residents available' : triggerLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-80" align="start">
          <Command>
            <CommandInput placeholder="Search residents..." />
            <CommandList>
              <CommandEmpty>No residents found.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem key={option.id} value={option.id} keywords={[option.name, option.detail]} onSelect={() => toggle(option.id)}>
                    <Check className={`h-4 w-4 mr-2 shrink-0 ${value.includes(option.id) ? 'opacity-100' : 'opacity-0'}`} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{option.name}</span>
                      {option.detail && <span className="truncate text-xs text-muted-foreground">{option.detail}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && <p className="text-xs text-destructive">Could not load residents: {error}</p>}
    </div>
  );
}
