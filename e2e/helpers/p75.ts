// Nearest-rank percentile: the smallest value with at least p% of samples at or below it.
export function percentile(samples: number[], p: number): number {
    if (samples.length === 0) throw new Error('percentile: no samples');
    const sorted = [...samples].sort((a, b) => a - b);
    const rank = Math.ceil((p / 100) * sorted.length);
    return sorted[Math.max(rank, 1) - 1];
}

export const p75 = (samples: number[]) => percentile(samples, 75);
