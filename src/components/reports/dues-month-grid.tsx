'use client';

import { cn } from '@/lib/utils';
import { PAYMENT_STATUS_META } from '@/components/houses/house-status-maps';
import { formatSummaryCell, type SummaryGrid, type SummaryGridStatus } from '@/lib/reports/summary-report';

// Grid view of the dues sheet (#1400, mockup option C): houses down, months across, plus the levy
// and the total owed. Screen only. A cell uses the same words and colours as the estate map and
// `HouseTileGrid` (`PAYMENT_STATUS_META`), so a status reads the same on every screen. The tile
// grid shows one status per house; this shows one per house and month, so it is its own component.

const LEGEND: SummaryGridStatus[] = ['overdue', 'outstanding', 'paid_up', 'no_invoice'];

const LEVY_TONE: Record<string, string> = {
  Paid: '',
  'Part paid': 'text-amber-700 dark:text-amber-400',
  'Not paid': 'text-red-700 dark:text-red-400',
  'No levy': 'text-muted-foreground',
};

export function DuesMonthGrid({ grid }: { grid: SummaryGrid }) {
  return (
    <div data-testid="dues-month-grid" className="p-4">
      <div role="list" aria-label="Legend" className="mb-3 flex flex-wrap gap-2 text-xs">
        {LEGEND.map((status) => {
          const meta = PAYMENT_STATUS_META[status];
          const Icon = meta.icon;
          return (
            <span key={status} role="listitem" className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-1', meta.cell)}>
              {Icon ? <Icon className={cn('h-3 w-3 shrink-0', meta.cue)} aria-hidden="true" /> : null}
              {meta.label}
            </span>
          );
        })}
      </div>

      {grid.houses.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No houses for this report.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-1 text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th scope="col" className="px-2 py-1 text-left font-medium">House</th>
                {grid.months.map((month) => (
                  <th key={month.key} scope="col" className="px-1 py-1 text-center font-medium whitespace-nowrap">{month.label}</th>
                ))}
                <th scope="col" className="px-2 py-1 text-left font-medium">Levy</th>
                <th scope="col" className="px-2 py-1 text-right font-medium">Owed</th>
              </tr>
            </thead>
            <tbody>
              {grid.houses.map((house) => (
                <tr key={house.id} data-testid="dues-grid-row">
                  <th scope="row" className="px-2 py-1 text-left font-medium whitespace-nowrap">
                    {house.houseNumber}
                    <span className="ml-1 font-normal text-muted-foreground">{house.streetName}</span>
                  </th>
                  {grid.months.map((month) => {
                    const status = house.months[month.key] ?? 'no_invoice';
                    const meta = PAYMENT_STATUS_META[status];
                    const Icon = meta.icon;
                    return (
                      <td
                        key={month.key}
                        data-testid="dues-grid-cell"
                        data-status={status}
                        title={`${house.houseNumber} ${house.streetName}, ${month.label}: ${meta.label}`}
                        className={cn('min-w-[4.5rem] rounded-md px-1.5 py-1 text-center', meta.cell)}
                      >
                        <span className="inline-flex items-center gap-1">
                          {Icon ? <Icon className={cn('h-3 w-3 shrink-0', meta.cue)} aria-hidden="true" /> : null}
                          {meta.label}
                        </span>
                      </td>
                    );
                  })}
                  <td className={cn('px-2 py-1 whitespace-nowrap', LEVY_TONE[house.levy])}>{house.levy}</td>
                  <td className="px-2 py-1 text-right font-medium tabular-nums">{formatSummaryCell(house.owed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
