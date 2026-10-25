'use client';

import * as React from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ResponsiveSheet,
  ResponsiveSheetBody,
  ResponsiveSheetDescription,
  ResponsiveSheetFooter,
  ResponsiveSheetHeader,
  ResponsiveSheetTitle,
} from '@/components/ui/responsive-sheet';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** Value of the "no filter" option. Every filter's options must include it. */
export const ALL_VALUE = 'all';

export interface ListFilter {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  /** Use a search box in the dropdown, for long option lists such as residents. */
  searchable?: boolean;
  className?: string;
}

interface ListFilterBarProps {
  search: { value: string; onChange: (value: string) => void; placeholder: string };
  filters: ListFilter[];
  onClearAll: () => void;
  /** Called after any change, so the page can reset `page` to 1. */
  onAnyChange?: () => void;
  /** Extra controls shown beside the filters, for example a date range picker. */
  children?: React.ReactNode;
  className?: string;
}

function FilterControl({ filter, onChange }: { filter: ListFilter; onChange: (value: string) => void }) {
  if (filter.searchable) {
    return (
      <SearchableSelect
        options={filter.options}
        value={filter.value}
        onValueChange={onChange}
        placeholder={filter.label}
        searchPlaceholder={`Search ${filter.label.toLowerCase()}...`}
        emptyMessage="No matches found."
        className={cn('h-9 w-full text-sm md:min-w-[280px] md:max-w-[360px]', filter.className)}
      />
    );
  }
  return (
    <Select value={filter.value} onValueChange={onChange}>
      <SelectTrigger aria-label={`Filter by ${filter.label}`} className={cn('h-9 w-full text-sm md:w-auto md:min-w-[110px]', filter.className)}>
        <SelectValue placeholder={filter.label} />
      </SelectTrigger>
      <SelectContent>
        {filter.options.map((option) => (
          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ListFilterBar({ search, filters, onClearAll, onAnyChange, children, className }: ListFilterBarProps) {
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const active = filters.filter((filter) => filter.value !== ALL_VALUE);
  const hasSearch = search.value !== '';
  const hasActive = active.length > 0 || hasSearch;

  const changeFilter = (filter: ListFilter) => (value: string) => {
    filter.onChange(value);
    onAnyChange?.();
  };
  const changeSearch = (value: string) => {
    search.onChange(value);
    onAnyChange?.();
  };
  const clearAll = () => {
    onClearAll();
    onAnyChange?.();
  };

  return (
    <div className={cn('flex flex-col gap-2', className)} data-testid="list-filter-bar">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full md:w-[180px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder={search.placeholder}
            aria-label={search.placeholder.replace(/\.+$/, '')}
            value={search.value}
            onChange={(e) => changeSearch(e.target.value)}
            className="h-9 pl-8 text-sm"
          />
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-2 md:hidden"
          onClick={() => setSheetOpen(true)}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filters
          {active.length > 0 && (
            <Badge variant="secondary" className="ml-1 px-1.5" data-testid="filters-count">{active.length}</Badge>
          )}
        </Button>

        <div className="hidden flex-wrap items-center gap-2 md:flex" data-testid="filters-inline">
          {filters.map((filter) => (
            <FilterControl key={filter.id} filter={filter} onChange={changeFilter(filter)} />
          ))}
          {children}
        </div>
      </div>

      {hasActive && (
        <div className="flex flex-wrap items-center gap-2" data-testid="active-filters">
          {hasSearch && (
            <Badge variant="secondary" className="gap-1 pr-1">
              Search: {search.value}
              <button type="button" aria-label="Remove Search filter" onClick={() => changeSearch('')} className="rounded-sm p-0.5 hover:bg-muted">
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </Badge>
          )}
          {active.map((filter) => {
            const optionLabel = filter.options.find((option) => option.value === filter.value)?.label ?? filter.value;
            return (
              <Badge key={filter.id} variant="secondary" className="gap-1 pr-1">
                {filter.label}: {optionLabel}
                <button type="button" aria-label={`Remove ${filter.label} filter`} onClick={() => changeFilter(filter)(ALL_VALUE)} className="rounded-sm p-0.5 hover:bg-muted">
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </Badge>
            );
          })}
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-muted-foreground hover:text-foreground" onClick={clearAll}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Clear all
          </Button>
        </div>
      )}

      {/* Mounted only while open: ResponsiveSheet reads matchMedia, which the page tests do not stub. */}
      {sheetOpen && (
      <ResponsiveSheet open={sheetOpen} onOpenChange={setSheetOpen} variant="sheet">
        <ResponsiveSheetHeader>
          <ResponsiveSheetTitle>Filters</ResponsiveSheetTitle>
          <ResponsiveSheetDescription>Narrow the list.</ResponsiveSheetDescription>
        </ResponsiveSheetHeader>
        <ResponsiveSheetBody className="space-y-4">
          {filters.map((filter) => (
            <div key={filter.id} className="space-y-1.5">
              <span className="text-sm font-medium">{filter.label}</span>
              <FilterControl filter={filter} onChange={changeFilter(filter)} />
            </div>
          ))}
          {children}
        </ResponsiveSheetBody>
        <ResponsiveSheetFooter>
          <Button type="button" variant="outline" onClick={clearAll} disabled={!hasActive}>Clear all</Button>
          <Button type="button" onClick={() => setSheetOpen(false)}>Done</Button>
        </ResponsiveSheetFooter>
      </ResponsiveSheet>
      )}
    </div>
  );
}
