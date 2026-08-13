import { describe, it, expect } from 'vitest';
import { classifyPaymentCadence } from '../classify-payment-cadence';

function daysApart(startISO: string, gapsDays: number[]): Date[] {
  const dates = [new Date(startISO)];
  for (const gap of gapsDays) {
    const prev = dates[dates.length - 1];
    dates.push(new Date(prev.getTime() + gap * 24 * 60 * 60 * 1000));
  }
  return dates;
}

describe('classifyPaymentCadence', () => {
  it('returns insufficient_data for 0 or 1 payments', () => {
    expect(classifyPaymentCadence([]).cadence).toBe('insufficient_data');
    expect(classifyPaymentCadence([new Date('2025-01-01')]).cadence).toBe('insufficient_data');
  });

  it('classifies regular ~30 day gaps as monthly', () => {
    const dates = daysApart('2025-01-01', [30, 31, 29, 30, 30]);
    const result = classifyPaymentCadence(dates);
    expect(result.cadence).toBe('monthly');
    expect(result.paymentCount).toBe(6);
  });

  it('classifies regular ~365 day gaps as annual', () => {
    const dates = daysApart('2020-01-01', [365, 366, 364]);
    const result = classifyPaymentCadence(dates);
    expect(result.cadence).toBe('annual');
  });

  it('classifies highly variable gaps as irregular', () => {
    const dates = daysApart('2025-01-01', [10, 90, 5, 200, 15]);
    const result = classifyPaymentCadence(dates);
    expect(result.cadence).toBe('irregular');
  });

  it('classifies gaps outside both windows as irregular', () => {
    const dates = daysApart('2025-01-01', [60, 62, 58, 61]);
    const result = classifyPaymentCadence(dates);
    expect(result.cadence).toBe('irregular');
  });

  it('is order-independent (sorts input internally)', () => {
    const forward = daysApart('2025-01-01', [30, 30, 30]);
    const shuffled = [forward[2], forward[0], forward[3], forward[1]];
    expect(classifyPaymentCadence(shuffled).cadence).toBe(classifyPaymentCadence(forward).cadence);
  });
});
