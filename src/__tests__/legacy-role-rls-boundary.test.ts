import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260830100300_get_my_role_resolves_custom_roles.sql', import.meta.url),
  'utf8'
);

describe('legacy role RLS boundary', () => {
  it('maps only built-in roles to legacy RLS buckets', () => {
    expect(migration).toContain("WHEN 'super_admin'       THEN RETURN 'admin'::user_role;");
    expect(migration).toContain("WHEN 'chairman'          THEN RETURN 'chairman'::user_role;");
    expect(migration).toContain("WHEN 'vice_chairman'     THEN RETURN 'chairman'::user_role;");
    expect(migration).toContain("WHEN 'financial_officer' THEN RETURN 'financial_secretary'::user_role;");
    expect(migration).toContain("WHEN 'security_officer'  THEN RETURN 'security_officer'::user_role;");
  });

  it('denies custom roles instead of assigning a legacy privilege bucket', () => {
    expect(migration).toContain('ELSE RETURN NULL;');
    expect(migration).not.toContain("RETURN 'admin'::user_role;\n    END IF");
    expect(migration).not.toContain("RETURN 'chairman'::user_role;\nEND;");
    expect(migration).not.toContain('v_category');
    expect(migration).not.toContain('v_level');
  });
});
