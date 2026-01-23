# Duplicate Matching System

## Overview
The Duplicate Matching System is a centralized guardrail designed to prevent duplicate transactions (Payments, Expenses) from being created via manual entry, bank statement imports, or email imports. It uses a configurable confidence threshold to block or flag potential duplicates.

## Core Logic

### Scoring Algorithm
The system calculates a "Duplicate Confidence Score" (0-100%) based on:
1.  **Amount**: Must match exactly (Score 0 if mismatch).
2.  **Date**: Must be within a strict tolerance window (default 3 days).
3.  **Description**:
    - Exact match: 100% score.
    - Fuzzy match (Fuse.js): Scaled score based on similarity.
    - Score Formula: `50 (Base) + (SimilarityScore * 50)`.

### Threshold
The blocking threshold is configurable in **System Settings > Duplicate Matching**.
- **Default**: 90%
- **Range**: 0-100%

## Integration Points

### 1. Manual Entry
- **Payments**: `createPayment` action checks for duplicates before insertion. Returns error if blocked.
- **Expenses**: `createExpense` action checks for duplicates. Throws error if blocked.

### 2. Imports
- **Bank Statements**: Rows are checked against existing DB records. Duplicates are marked with `is_duplicate` flag and skip reason.
- **Email Imports**: Incoming emails are checked before being queued/processed.

## Files
- **Logic**: `src/lib/matching/duplicate-scoring.ts` (Pure logic), `src/lib/matching/duplicate-matcher.ts` (DB Service)
- **Settings**: `src/lib/settings/hierarchical-settings-types.ts`, `src/app/(dashboard)/settings/system/page.tsx`
- **Tests**: `src/lib/matching/__tests__/duplicate-matcher.test.ts`
