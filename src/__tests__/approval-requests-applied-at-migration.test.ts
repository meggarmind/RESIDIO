import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static checks on the approval_requests.applied_at migration (#557). It pins the text only:
 * a nullable column, a backfill limited to approved rows, and nothing else.
 */

const root = fileURLToPath(new URL('../..', import.meta.url));
const sql = readFileSync(
  path.join(root, 'supabase/migrations/20261014180000_approval_requests_applied_at.sql'),
  'utf8',
)
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .replace(/\s+/g, ' ')
  .trim();

describe('approval_requests applied_at migration (static)', () => {
  it('adds a nullable timestamptz applied_at idempotently', () => {
    expect(sql).toContain(
      'ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS applied_at timestamptz;',
    );
    expect(sql).not.toMatch(/applied_at timestamptz\s+(NOT NULL|DEFAULT)/i);
  });

  it('backfills only approved rows that have no applied_at, from reviewed_at', () => {
    expect(sql).toContain(
      "UPDATE public.approval_requests SET applied_at = reviewed_at WHERE status = 'approved' AND applied_at IS NULL;",
    );
  });

  it('contains exactly the two statements and no policy, grant, index or drop', () => {
    expect(sql.split(';').filter((s) => s.trim()).length).toBe(2);
    for (const word of ['POLICY', 'GRANT', 'REVOKE', 'INDEX', 'DROP', 'DELETE', 'TRIGGER']) {
      expect(sql.toUpperCase()).not.toContain(word);
    }
  });
});
