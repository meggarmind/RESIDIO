'use client';

import type { ReactNode } from 'react';
import { Plus, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SettingsEmptyState, SettingsSkeleton } from '@/components/settings/settings-states';
import { cn } from '@/lib/utils';

// after: pads the 16px box to a 44px hit area on phones without changing the drawn size.
const PHONE_CHECKBOX = 'relative after:absolute after:-inset-[14px] md:after:inset-0';

export type CrudColumn<T> = {
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
};

export type CrudRowAction<T> = {
  icon: LucideIcon;
  label: string;
  onClick: (row: T) => void;
  disabled?: boolean;
  destructive?: boolean;
};

/**
 * Reference-data list for a settings page (#788): title, add button, table, skeleton and
 * empty state. Every write control (add, row actions, selection) renders only when canManage.
 */
export function CrudTable<T extends { id: string }>({
  title,
  headerExtra,
  toolbar,
  addLabel,
  onAdd,
  canManage,
  rows,
  rowLabel,
  isLoading,
  columns,
  actions,
  empty,
  selection,
}: {
  title: string;
  headerExtra?: ReactNode;
  toolbar?: ReactNode;
  addLabel: string;
  onAdd: () => void;
  canManage: boolean;
  rows: T[] | undefined;
  rowLabel: (row: T) => string;
  isLoading: boolean;
  columns: CrudColumn<T>[];
  actions: CrudRowAction<T>[];
  empty: { icon: LucideIcon; title: string; description: string };
  selection?: { selectedIds: string[]; onChange: (ids: string[]) => void };
}) {
  const list = rows ?? [];
  const selectable = canManage && !!selection;
  const columnCount = columns.length + (selectable ? 1 : 0) + (canManage ? 1 : 0);
  const addButton = (
    <Button size="sm" className="min-h-11 md:min-h-8" onClick={onAdd}>
      <Plus className="mr-2 h-4 w-4" />
      {addLabel}
    </Button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-4">
          <h3 className="text-lg font-medium">{title}</h3>
          {headerExtra}
        </div>
        <div className="flex items-center gap-2">
          {canManage && toolbar}
          {canManage && addButton}
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-[40px]">
                  <Checkbox
                    className={PHONE_CHECKBOX}
                    checked={list.length > 0 && selection.selectedIds.length === list.length}
                    onCheckedChange={(checked) => selection.onChange(checked ? list.map((r) => r.id) : [])}
                    aria-label="Select all"
                  />
                </TableHead>
              )}
              {columns.map((col, i) => (
                <TableHead key={i} className={col.className}>{col.header}</TableHead>
              ))}
              {canManage && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columnCount}>
                  <SettingsSkeleton />
                </TableCell>
              </TableRow>
            ) : list.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount}>
                  <SettingsEmptyState {...empty} action={canManage && addButton} />
                </TableCell>
              </TableRow>
            ) : (
              list.map((row) => (
                <TableRow key={row.id}>
                  {selectable && (
                    <TableCell>
                      <Checkbox
                        className={PHONE_CHECKBOX}
                        checked={selection.selectedIds.includes(row.id)}
                        onCheckedChange={(checked) =>
                          selection.onChange(
                            checked
                              ? [...selection.selectedIds, row.id]
                              : selection.selectedIds.filter((id) => id !== row.id)
                          )
                        }
                        aria-label={`Select ${rowLabel(row)}`}
                      />
                    </TableCell>
                  )}
                  {columns.map((col, i) => (
                    <TableCell key={i} className={col.className}>{col.cell(row)}</TableCell>
                  ))}
                  {canManage && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {actions.map(({ icon: Icon, label, onClick, disabled, destructive }) => (
                          <Button
                            key={label}
                            variant="ghost"
                            size="icon"
                            className={cn(
                              'size-11 md:size-8',
                              destructive && 'text-destructive hover:text-destructive'
                            )}
                            onClick={() => onClick(row)}
                            disabled={disabled}
                            aria-label={`${label} ${rowLabel(row)}`}
                          >
                            <Icon className="h-4 w-4" />
                          </Button>
                        ))}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
