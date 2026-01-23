import { describe, it, expect } from 'vitest';
import { calculateDuplicateScore } from '../duplicate-scoring';

describe('calculateDuplicateScore', () => {
    const baseDate = new Date('2024-01-01T10:00:00Z');

    it('should return 100 for exact match', () => {
        const result = calculateDuplicateScore(
            { amount: 100, date: baseDate, description: 'Payment for Utilities' },
            { amount: 100, date: baseDate, description: 'Payment for Utilities' }
        );
        expect(result).toBe(100);
    });

    it('should return 0 for different amount', () => {
        const result = calculateDuplicateScore(
            { amount: 100, date: baseDate, description: 'Payment' },
            { amount: 101, date: baseDate, description: 'Payment' }
        );
        expect(result).toBe(0);
    });

    it('should return 0 for date difference > 3 days', () => {
        const distantDate = new Date(baseDate);
        distantDate.setDate(distantDate.getDate() + 4);

        const result = calculateDuplicateScore(
            { amount: 100, date: baseDate, description: 'Payment' },
            { amount: 100, date: distantDate, description: 'Payment' }
        );
        expect(result).toBe(0);
    });

    it('should return 100 (50 base + 50 desc) for fuzzy match with high similarity', () => {
        // "Utilities Payment" vs "Utilities Pymnt"
        // Base 50. Description score depends on Fuse.
        const result = calculateDuplicateScore(
            { amount: 100, date: baseDate, description: 'Utilities Payment' },
            { amount: 100, date: baseDate, description: 'Utilities Pymnt' }
        );
        // Expect high score, likely > 80
        expect(result).toBeGreaterThan(80);
    });

    it('should return low score for different description', () => {
        const result = calculateDuplicateScore(
            { amount: 100, date: baseDate, description: 'Rent' },
            { amount: 100, date: baseDate, description: 'Groceries' }
        );
        // Base 50 remains because amount and date match.
        // Description mismatch should add 0 (or near 0).
        // So result should be around 50.
        // Wait, the logic is: `score = 50`. Then `descScore = (1 - fuseScore) * 50`.
        // Fuse score for "Rent" vs "Groceries" should be near 1 (bad).
        // So added score near 0.
        expect(result).toBeLessThan(60);
        expect(result).toBeGreaterThanOrEqual(50);
    });

    it('should strictly match case insensitive', () => {
        const result = calculateDuplicateScore(
            { amount: 100, date: baseDate, description: 'PAYMENT' },
            { amount: 100, date: baseDate, description: 'payment' }
        );
        expect(result).toBe(100);
    });
});
