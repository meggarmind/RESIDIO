import Fuse from 'fuse.js';

/**
 * Calculate duplicate confidence score (0-100)
 * 100 = Exact match
 * 0 = No match
 */
export function calculateDuplicateScore(
    target: { description?: string; amount: number; date: Date },
    candidate: { description?: string; amount: number; date: Date }
): number {
    let score = 0;

    // Amount mismatch = 0 immediately (unless we want to fuzzy match amount too, but usually risky)
    if (target.amount !== candidate.amount) {
        return 0;
    }

    // Date check (within tolerance is handled by query usually, but we can penalize distance)
    const dayDiff = Math.abs(
        (target.date.getTime() - candidate.date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (dayDiff > 3) return 0; // Hard cutoff for safety

    // Base score for amount + nearby date
    score = 50;

    // Description check
    const targetDesc = (target.description || '').toLowerCase().trim();
    const candidateDesc = (candidate.description || '').toLowerCase().trim();

    if (targetDesc === candidateDesc && targetDesc.length > 0) {
        return 100;
    }

    if (targetDesc && candidateDesc) {
        // Fuzzy matching
        // Fuse gives score 0 (perfect) to 1 (mismatch)
        const fuse = new Fuse([candidateDesc], { includeScore: true });
        const result = fuse.search(targetDesc);

        if (result.length > 0 && result[0].score !== undefined) {
            // Invert Fuse score: 0 -> 100, 1 -> 0
            // We already have 50 base. Let's weigh description heavily.
            // If fuse score is 0 (perfect), add 50.
            // If fuse score is 0.4 (decent), add 30.
            // Score = 50 + (1 - fuseScore) * 50
            const fuseScore = result[0].score;
            const descScore = Math.max(0, (1 - fuseScore) * 50);
            score += descScore;
        }
    }

    return Math.min(100, Math.round(score));
}
