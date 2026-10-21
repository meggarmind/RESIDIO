import { describe, it, expect } from 'vitest';
import { p75, percentile } from '../../e2e/helpers/p75';

describe('p75', () => {
  it('returns the nearest-rank 75th percentile', () => {
    expect(p75([1, 2, 3, 4])).toBe(3);
    expect(p75([10, 20, 30, 40, 50, 60, 70, 80])).toBe(60);
  });

  it('is order independent and does not mutate input', () => {
    const input = [400, 100, 300, 200];
    expect(p75(input)).toBe(300);
    expect(input).toEqual([400, 100, 300, 200]);
  });

  it('handles a single sample and 100th percentile', () => {
    expect(p75([5])).toBe(5);
    expect(percentile([1, 2, 3], 100)).toBe(3);
  });

  it('throws on empty input', () => {
    expect(() => p75([])).toThrow();
  });
});
