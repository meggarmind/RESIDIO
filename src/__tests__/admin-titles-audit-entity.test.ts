import { describe, expect, it } from 'vitest';
import { resolveEntityDisplay } from '@/lib/audit/recorder';
import { AUDIT_ENTITY_LABELS } from '@/types/database';

/**
 * The admin_titles audit entity (#823). The trigger behaviour of the migration cannot run here
 * (no database in unit tests); it is verified by the migration's ROLLBACK probe.
 */
describe('admin_titles audit entity', () => {
  it('has a label and resolves its display from the title name', () => {
    expect(AUDIT_ENTITY_LABELS.admin_titles).toBe('Admin Title');
    expect(resolveEntityDisplay('admin_titles', { name: 'Vice Chairman', role_id: 'r1' })).toBe('Vice Chairman');
  });
});
