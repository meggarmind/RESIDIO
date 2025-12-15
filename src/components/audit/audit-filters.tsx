'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CalendarIcon, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  type AuditAction,
  type AuditEntityType,
} from '@/types/database';
import { useAuditActors } from '@/hooks/use-audit-logs';

const ALL_VALUE = '_all';

interface AuditFiltersProps {
  onFiltersChange: (filters: {
    entityType?: AuditEntityType;
    action?: AuditAction;
    actorId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }) => void;
}

export function AuditFilters({ onFiltersChange }: AuditFiltersProps) {
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState<string>(ALL_VALUE);
  const [action, setAction] = useState<string>(ALL_VALUE);
  const [actorId, setActorId] = useState<string>(ALL_VALUE);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  const { data: actors } = useAuditActors();

  const handleApplyFilters = () => {
    onFiltersChange({
      entityType: entityType === ALL_VALUE ? undefined : (entityType as AuditEntityType),
      action: action === ALL_VALUE ? undefined : (action as AuditAction),
      actorId: actorId === ALL_VALUE ? undefined : actorId,
      startDate: startDate ? startDate.toISOString() : undefined,
      endDate: endDate ? endDate.toISOString() : undefined,
      search: search || undefined,
    });
  };

  const handleClearFilters = () => {
    setSearch('');
    setEntityType(ALL_VALUE);
    setAction(ALL_VALUE);
    setActorId(ALL_VALUE);
    setStartDate(undefined);
    setEndDate(undefined);
    onFiltersChange({});
  };

  const hasActiveFilters =
    search ||
    entityType !== ALL_VALUE ||
    action !== ALL_VALUE ||
    actorId !== ALL_VALUE ||
    startDate ||
    endDate;

  // Date preset helpers
  const setDatePreset = (preset: 'today' | 'week' | 'month') => {
    const now = new Date();
    let start: Date;

    switch (preset) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
        break;
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        break;
    }

    setStartDate(start);
    setEndDate(now);
  };

  // Quick action filters
  const quickActionFilters: Array<{ label: string; action: string }> = [
    { label: 'All Actions', action: ALL_VALUE },
    { label: 'Creates', action: 'CREATE' },
    { label: 'Updates', action: 'UPDATE' },
    { label: 'Deletes', action: 'DELETE' },
    { label: 'Approvals', action: 'APPROVE' },
  ];

  const handleQuickActionFilter = (actionValue: string) => {
    setAction(actionValue);
    onFiltersChange({
      entityType: entityType === ALL_VALUE ? undefined : (entityType as AuditEntityType),
      action: actionValue === ALL_VALUE ? undefined : (actionValue as AuditAction),
      actorId: actorId === ALL_VALUE ? undefined : actorId,
      startDate: startDate ? startDate.toISOString() : undefined,
      endDate: endDate ? endDate.toISOString() : undefined,
      search: search || undefined,
    });
  };

  return (
    <div className="space-y-4">
      {/* Quick action filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {quickActionFilters.map((filter) => (
          <Badge
            key={filter.label}
            variant={action === filter.action ? 'default' : 'outline'}
            className="cursor-pointer hover:bg-accent transition-colors"
            onClick={() => handleQuickActionFilter(filter.action)}
          >
            {filter.label}
          </Badge>
        ))}
      </div>

      {/* Search and quick date presets */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by entity name or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
          />
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDatePreset('today')}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDatePreset('week')}
          >
            Last 7 Days
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDatePreset('month')}
          >
            Last 30 Days
          </Button>
        </div>
      </div>

      {/* Filter dropdowns */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Entity Type */}
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Entities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All Entities</SelectItem>
            {Object.entries(AUDIT_ENTITY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Action Type */}
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All Actions</SelectItem>
            {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Actor */}
        <Select value={actorId} onValueChange={setActorId}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Users" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All Users</SelectItem>
            {actors?.map((actor) => (
              <SelectItem key={actor.id} value={actor.id}>
                {actor.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Start Date */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-[140px] justify-start text-left font-normal',
                !startDate && 'text-muted-foreground'
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {startDate ? format(startDate, 'MMM d, yyyy') : 'Start Date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={startDate}
              onSelect={setStartDate}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {/* End Date */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-[140px] justify-start text-left font-normal',
                !endDate && 'text-muted-foreground'
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {endDate ? format(endDate, 'MMM d, yyyy') : 'End Date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={endDate}
              onSelect={setEndDate}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {/* Apply button */}
        <Button onClick={handleApplyFilters}>
          Apply Filters
        </Button>

        {/* Clear button */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={handleClearFilters}>
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
