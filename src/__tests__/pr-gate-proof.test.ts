import { describe, expect, it } from 'vitest';

// THROWAWAY (#397): deliberately failing test to prove the required
// "PR gate" check blocks a merge. This file must never land.
describe('PR gate proof', () => {
  it('fails on purpose', () => {
    expect(1 + 1).toBe(3);
  });
});
