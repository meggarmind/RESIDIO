import { format, isValid, parseISO } from 'date-fns';

export interface CoveredPeriodSource {
  period_start: string | null | undefined;
  period_end: string | null | undefined;
}

export interface CoveredPeriod {
  start: string;
  end: string;
}

export type BatchAllocationStatus = 'paid' | 'partially_paid';

export interface PaymentReceiptAllocation {
  invoiceId: string;
  invoiceNumber?: string | null;
  periodStart: string;
  periodEnd: string;
  amountAllocated: number;
  invoiceAmountDue: number;
  amountPaidBefore: number;
  amountPaidAfter: number;
  balanceAfter: number;
  statusAfter: BatchAllocationStatus;
}

export interface ReceiptAllocationSummary {
  fullyCoveredPeriod: CoveredPeriod | null;
  partialAllocations: PaymentReceiptAllocation[];
  allocations: PaymentReceiptAllocation[];
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

export function deriveCoveredPeriod(sources: CoveredPeriodSource[]): CoveredPeriod | null {
  const valid = sources
    .map((source) => ({ start: parseDate(source.period_start), end: parseDate(source.period_end) }))
    .filter((source): source is { start: Date; end: Date } => Boolean(source.start && source.end && source.end >= source.start));

  if (valid.length === 0) return null;

  const start = valid.reduce((earliest, current) => current.start < earliest ? current.start : earliest, valid[0].start);
  const end = valid.reduce((latest, current) => current.end > latest ? current.end : latest, valid[0].end);

  return {
    start: format(start, 'yyyy-MM-dd'),
    end: format(end, 'yyyy-MM-dd'),
  };
}

export function formatCoveredPeriod(start: string | null | undefined, end: string | null | undefined): string | null {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate || !endDate || endDate < startDate) return null;

  const startLabel = format(startDate, 'MMM yyyy');
  const endLabel = format(endDate, 'MMM yyyy');
  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
}

export function summarizeReceiptAllocations(
  allocations: PaymentReceiptAllocation[],
): ReceiptAllocationSummary {
  const fullyPaidAllocations = allocations.filter((allocation) => allocation.statusAfter === 'paid');

  return {
    fullyCoveredPeriod: deriveCoveredPeriod(fullyPaidAllocations.map((allocation) => ({
      period_start: allocation.periodStart,
      period_end: allocation.periodEnd,
    }))),
    partialAllocations: allocations.filter((allocation) => allocation.statusAfter === 'partially_paid'),
    allocations,
  };
}
