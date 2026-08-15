export type PaymentCadence = 'monthly' | 'annual' | 'irregular' | 'insufficient_data';

export interface CadenceClassification {
  cadence: PaymentCadence;
  paymentCount: number;
  medianGapDays: number | null;
  gapStdDevDays: number | null;
}

const MONTHLY_RANGE: [number, number] = [24, 36];
const ANNUAL_RANGE: [number, number] = [335, 395];
const HIGH_VARIANCE_RATIO = 0.5;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdDev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Classifies a resident's payment cadence from a chronologically sorted list of payment dates.
 * Buckets by the median gap between consecutive payments: ~monthly (24-36 days),
 * ~annual (335-395 days), or irregular (outside those windows or high relative variance).
 */
export function classifyPaymentCadence(paymentDates: Date[]): CadenceClassification {
  if (paymentDates.length < 2) {
    return { cadence: 'insufficient_data', paymentCount: paymentDates.length, medianGapDays: null, gapStdDevDays: null };
  }

  const sorted = [...paymentDates].sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gapDays = (sorted[i].getTime() - sorted[i - 1].getTime()) / (1000 * 60 * 60 * 24);
    gaps.push(gapDays);
  }

  const medianGap = median(gaps);
  const meanGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
  const gapStdDev = stdDev(gaps, meanGap);
  const varianceRatio = medianGap > 0 ? gapStdDev / medianGap : Infinity;

  let cadence: PaymentCadence;
  if (medianGap >= MONTHLY_RANGE[0] && medianGap <= MONTHLY_RANGE[1] && varianceRatio <= HIGH_VARIANCE_RATIO) {
    cadence = 'monthly';
  } else if (medianGap >= ANNUAL_RANGE[0] && medianGap <= ANNUAL_RANGE[1] && varianceRatio <= HIGH_VARIANCE_RATIO) {
    cadence = 'annual';
  } else {
    cadence = 'irregular';
  }

  return {
    cadence,
    paymentCount: paymentDates.length,
    medianGapDays: Math.round(medianGap),
    gapStdDevDays: Math.round(gapStdDev),
  };
}
