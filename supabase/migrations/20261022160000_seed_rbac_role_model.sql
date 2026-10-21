-- Seed the new role model (#825, slice 3 of the RBAC redesign #822).
--
-- WHAT CHANGES
--   1. New permission system.assign_board_roles ("Assign Board Roles"), held by super_admin only.
--   2. New roles: welfare_officer and trustee (requires_resident = true), security_guard_supervisor
--      (requires_resident = false). All three is_system_role = true, so only a super_admin may edit
--      their permissions and none can be deleted from the UI.
--   3. requires_resident = true on chairman, financial_officer, secretary and security_officer.
--   4. Titles (admin_titles), principal first, seats in brackets:
--        chairman                  Chairman (1), Vice Chairman (1)
--        financial_officer         Treasurer (1), Financial Secretary (1)
--        secretary                 Secretary (1), Assistant Secretary (1)
--        security_officer          Chief Security Officer (1), Assistant Chief Security Officer (1)
--        welfare_officer           Welfare Officer (1)
--        trustee                   Trustee (unlimited)
--        security_guard_supervisor Security Guard Supervisor (1)
--   5. Permission sets (listed in full below).
--   6. role_assignment_rules re-seeded to the owner's matrix (issue #825 comment, 2026-10-19).
--   7. vice_chairman holders become chairman with the title Vice Chairman; project_manager and
--      resident holders lose their role (role_id null); then the three roles are deleted.
--   8. Role descriptions updated for the four existing officer roles.
--
-- PERMISSION SETS
--   chairman: current set, PLUS
--     settings.view, settings.manage_general, settings.manage_billing, settings.manage_security,
--     settings.manage_reference, settings.view_audit_logs, system.assign_roles,
--     view_projects, manage_projects            (projects.* is the unprefixed pair, see 20260907000000)
--   chairman: REMOVED (derived from the migration files; the database is ground truth)
--     | permission                      | why removed                                              |
--     | impersonation.view_sessions     | no impersonation for chairman (#822)                     |
--     | impersonation.start_session     | no impersonation for chairman (#822)                     |
--     | impersonation.approve_requests  | super_admin only, so no officer approves their own request |
--     | impersonation.manage_settings   | super_admin only                                         |
--     | any other system.* except the two kept below | no other system.* (#822); the files show none |
--   chairman: KEPT system.*
--     | system.assign_roles             | granted by this slice (#822)                             |
--     | system.view_all_profiles        | EXCEPTION, needed by assign_roles: it is the RLS read of  |
--     |                                 | every profile (20261020200000) and the role screens read  |
--     |                                 | accounts through the caller's client. Already held, so    |
--     |                                 | this is no new access (firstmate decision, 2026-10-21).   |
--   financial_officer, security_officer: current set, PLUS impersonation.start_session and
--     impersonation.view_sessions. financial_officer also LOSES impersonation.approve_requests if it
--     holds it (20260102095132 granted it; 20260830100100 found that permission missing, so it is
--     probably not held).
--   secretary: unchanged.
--   welfare_officer (22): residents.view, houses.view, announcements.view, announcements.create,
--     announcements.update, announcements.delete, announcements.publish,
--     announcements.manage_categories, announcements.manage_templates,
--     announcements.emergency_broadcast, notes.view, notes.create, notes.update, notes.delete,
--     notes.view_confidential, notifications.view, notifications.send, notifications.manage,
--     notifications.manage_delivery, documents.view, two_factor.enable, two_factor.disable
--   trustee (26): residents.view, houses.view, payments.view, billing.view, security.view,
--     security.view_logs, reports.view_financial, reports.view_occupancy, reports.view_security,
--     reports.export, approvals.view, documents.view, documents.view_all, announcements.view,
--     notifications.view, report_subscriptions.view, notes.view, email_imports.view, whatsapp.view,
--     groups.view, view_expenditure, view_vendors, view_projects, two_factor.view_status,
--     two_factor.enable, two_factor.disable (self-service two-factor on the holder's own account,
--     owner decision 2026-10-21; every other role already has it, 20260830100100)
--     (document downloads are gated on documents.view, src/actions/documents/download-document.ts;
--     there is no separate download permission)
--   security_guard_supervisor (8): security.view, security.generate_codes, security.verify_codes,
--     security.record_access, security.operate_records (the RLS permission behind viewing contacts
--     and codes and recording check-ins, as security_officer holds it), security.manage_records
--     (owner decision 2026-10-21: the access_codes INSERT policy requires it, and generateAccessCode
--     writes through the caller's client; it also allows creating and updating security contacts
--     and visitor vehicles), two_factor.enable, two_factor.disable
--   super_admin only: system.assign_board_roles, impersonation.approve_requests,
--     impersonation.manage_settings. Removed from every other role, custom roles included.
--   The three new roles are set to exactly the lists above (anything else they hold is removed).
--
-- ROLE ASSIGNMENT RULES (true = allowed; every other cell false)
--   chairman, trustee                    resident_landlord, non_resident_landlord
--   financial_officer, secretary,
--   welfare_officer                      resident_landlord, non_resident_landlord, tenant, co_resident
--   security_officer                     resident_landlord, non_resident_landlord, tenant
--   Rows for super_admin and security_guard_supervisor are deleted (a role with no row is allowed:
--   src/actions/roles/assignment-rules.ts treats a missing rule as allowed). Rows for custom roles
--   are left alone. Accepted consequence (owner): tenants and co_residents can no longer hold the
--   Vice Chairman title.
--
-- WHY
--   The roles did not match the estate's structure (umbrella #822). Slice 1 (20261022150000) added
--   titles, seats and the resident-link rule; slice 2 moved policies to has_permission(). This
--   slice gives them roles to act on.
--
-- WHO IS AFFECTED
--   - Chairman holders lose the four impersonation.* permissions and gain settings, role
--     assignment and projects. Financial and security officers gain impersonation.
--   - vice_chairman, project_manager holders: 0 on Stage and Prod (2026-10-19). resident holders:
--     every plain resident account; they keep the portal, which admits a profile by resident_id
--     (src/middleware.ts), not by role.
--   - No existing profile is re-checked by the requires_resident flag: the slice 1 trigger only
--     checks a role_id or resident_id that changes. Only the profiles remapped in step 7 change.
--   - Deleting the retired roles cascades their role_permissions, role_assignment_rules,
--     admin_titles and two_factor_policies rows. profiles.role_id is ON DELETE SET NULL, but every
--     holder is moved first and the delete refuses if any remain.
--
-- SAFETY
--   Every permission named here must exist, or the migration raises before writing a grant.
--   A vice_chairman holder that cannot become chairman with the Vice Chairman title (no linked
--   resident, or more than one holder for the one seat) raises, so it is resolved by hand rather
--   than losing access silently. Each remapped profile gets one audit_logs row.
--
-- IDEMPOTENT: ON CONFLICT DO NOTHING / DO UPDATE on every insert, guarded updates, and each retired
--   role is handled only while it still exists. A second run changes nothing.
--
-- ROLLBACK (no automatic restore of deleted roles; their holders and grants are in audit_logs and
--   in the files that seeded them):
--   DELETE FROM public.app_roles WHERE name IN ('welfare_officer', 'trustee', 'security_guard_supervisor');
--   DELETE FROM public.admin_titles;
--   UPDATE public.app_roles SET requires_resident = false
--     WHERE name IN ('chairman', 'financial_officer', 'secretary', 'security_officer');
--   DELETE FROM public.app_permissions WHERE name = 'system.assign_board_roles';
--   Then re-grant the removed chairman impersonation.* rows, revoke the added chairman, financial
--   and security officer rows, and re-create vice_chairman, project_manager and resident from
--   20251222000000_create_rbac_system.sql with their grants.
--
-- VERIFY (read-only, run on the database after applying):
--   -- Each role's permission names, to diff against the lists above.
--   SELECT r.name AS role, count(*) AS n, string_agg(p.name, ', ' ORDER BY p.name) AS permissions
--   FROM public.app_roles r
--   JOIN public.role_permissions rp ON rp.role_id = r.id
--   JOIN public.app_permissions p ON p.id = rp.permission_id
--   GROUP BY r.name ORDER BY r.name;
--
--   -- super_admin only: three rows, all super_admin.
--   SELECT p.name, r.name FROM public.role_permissions rp
--   JOIN public.app_permissions p ON p.id = rp.permission_id
--   JOIN public.app_roles r ON r.id = rp.role_id
--   WHERE p.name IN ('system.assign_board_roles', 'impersonation.approve_requests', 'impersonation.manage_settings')
--   ORDER BY 1, 2;
--
--   SELECT name, requires_resident, is_system_role, category FROM public.app_roles ORDER BY name;
--     -- no vice_chairman, project_manager, resident; 6 flagged true (all but super_admin and the guard supervisor)
--   SELECT r.name, t.name, t.is_principal, t.seats FROM public.admin_titles t
--   JOIN public.app_roles r ON r.id = t.role_id ORDER BY r.name, t.sort_order;   -- 11 rows
--   SELECT r.name, a.resident_role, a.is_allowed FROM public.role_assignment_rules a
--   JOIN public.app_roles r ON r.id = a.app_role_id ORDER BY 1, 2;               -- 54 rows for the six roles
--
--   -- Probe: the new roles behave under the slice 1 trigger, then ROLLBACK leaves nothing behind.
--   -- Needs one profile that does not hold super_admin. Prints 'role model probe passed'.
--   BEGIN;
--   DO $probe$
--   DECLARE v_p uuid; v_trustee uuid; v_sgs uuid; v_t uuid;
--   BEGIN
--     SELECT id INTO v_trustee FROM public.app_roles WHERE name = 'trustee';
--     SELECT id INTO v_sgs FROM public.app_roles WHERE name = 'security_guard_supervisor';
--     SELECT id INTO v_t FROM public.admin_titles WHERE role_id = v_trustee AND name = 'Trustee';
--     SELECT p.id INTO v_p FROM public.profiles p
--       WHERE p.role_id IS DISTINCT FROM (SELECT id FROM public.app_roles WHERE name = 'super_admin')
--       ORDER BY p.id LIMIT 1;
--     UPDATE public.profiles SET resident_id = NULL WHERE id = v_p;
--     BEGIN
--       UPDATE public.profiles SET role_id = v_trustee, title_id = v_t WHERE id = v_p;
--       RAISE EXCEPTION 'probe failed: trustee accepted without a resident';
--     EXCEPTION WHEN check_violation THEN NULL;
--     END;
--     UPDATE public.profiles SET role_id = v_sgs WHERE id = v_p;          -- non-resident role: accepted
--     IF (SELECT array_agg(r.name || '=' || n ORDER BY r.name)
--         FROM (SELECT rp.role_id, count(*) AS n FROM public.role_permissions rp GROUP BY rp.role_id) c
--         JOIN public.app_roles r ON r.id = c.role_id
--         WHERE r.name IN ('welfare_officer', 'trustee', 'security_guard_supervisor'))
--        IS DISTINCT FROM ARRAY['security_guard_supervisor=8', 'trustee=26', 'welfare_officer=22'] THEN
--       RAISE EXCEPTION 'probe failed: a new role does not hold exactly its list';
--     END IF;
--     IF EXISTS (SELECT 1 FROM public.role_permissions rp
--                JOIN public.app_permissions p ON p.id = rp.permission_id
--                JOIN public.app_roles r ON r.id = rp.role_id
--                WHERE p.name IN ('system.assign_board_roles', 'impersonation.approve_requests',
--                                 'impersonation.manage_settings')
--                  AND r.name <> 'super_admin') THEN
--       RAISE EXCEPTION 'probe failed: a super_admin-only permission is held by another role';
--     END IF;
--     IF EXISTS (SELECT 1 FROM public.role_permissions rp
--                JOIN public.app_permissions p ON p.id = rp.permission_id
--                JOIN public.app_roles r ON r.id = rp.role_id
--                WHERE r.name = 'chairman'
--                  AND (p.name LIKE 'impersonation.%'
--                       OR (p.name LIKE 'system.%'
--                           AND p.name NOT IN ('system.assign_roles', 'system.view_all_profiles')))) THEN
--       RAISE EXCEPTION 'probe failed: chairman still holds impersonation.* or another system.*';
--     END IF;
--     IF EXISTS (SELECT 1 FROM public.app_roles
--                WHERE name IN ('vice_chairman', 'project_manager', 'resident')) THEN
--       RAISE EXCEPTION 'probe failed: a retired role still exists';
--     END IF;
--     RAISE NOTICE 'role model probe passed';
--   END
--   $probe$;
--   ROLLBACK;

BEGIN;

-- 1. The board-role permission.
INSERT INTO public.app_permissions (name, display_name, description, category, is_active)
VALUES (
  'system.assign_board_roles',
  'Assign Board Roles',
  'Grant the super_admin, chairman or trustee role, and change an account that holds super_admin or chairman',
  'system',
  true
)
ON CONFLICT (name) DO NOTHING;

-- 2. The new roles. level is retired in slice 4; 3 matches the other officer roles.
INSERT INTO public.app_roles
  (name, display_name, description, category, level, is_system_role, is_active, can_be_assigned_to_resident, requires_resident)
VALUES
  ('welfare_officer', 'Welfare Officer',
   'Resident welfare: residents and houses (view), announcements, notes, notifications and documents (view)',
   'exco', 3, true, true, true, true),
  ('trustee', 'Trustee',
   'Board of trustees: views every module except settings, and exports reports. Changes nothing but their own two-factor setting',
   'bot', 3, true, true, true, true),
  ('security_guard_supervisor', 'Security Guard Supervisor',
   'Gate supervisor, not a resident: security contacts, creating and verifying access codes, and check-ins',
   'staff', 3, true, true, false, false)
ON CONFLICT (name) DO NOTHING;

-- 3. Resident-only officer roles. Touches app_roles only: the slice 1 trigger re-checks a profile
--    only when its own role_id or resident_id changes, so existing holders are not affected.
UPDATE public.app_roles
SET requires_resident = true
WHERE name IN ('chairman', 'financial_officer', 'secretary', 'security_officer',
               'welfare_officer', 'trustee')
  AND requires_resident IS DISTINCT FROM true;

-- 8 (done here, beside the flags). Descriptions that name the titles.
UPDATE public.app_roles AS r
SET description = d.description
FROM (VALUES
  ('chairman', 'Estate chairman (Chairman, Vice Chairman): oversight of all operations, settings, role assignment and projects'),
  ('financial_officer', 'Treasurer or Financial Secretary: billing, payments and financial reports'),
  ('secretary', 'Secretary or Assistant Secretary: resident records, houses and communications'),
  ('security_officer', 'Chief Security Officer or Assistant CSO: security contacts, access codes and gate operations')
) AS d(role_name, description)
WHERE r.name = d.role_name
  AND r.description IS DISTINCT FROM d.description;

-- 4. Titles.
INSERT INTO public.admin_titles (role_id, name, is_principal, seats, sort_order)
SELECT r.id, t.title, t.is_principal, t.seats, t.sort_order
FROM (VALUES
  ('chairman', 'Chairman', true, 1, 0),
  ('chairman', 'Vice Chairman', false, 1, 1),
  ('financial_officer', 'Treasurer', true, 1, 0),
  ('financial_officer', 'Financial Secretary', false, 1, 1),
  ('secretary', 'Secretary', true, 1, 0),
  ('secretary', 'Assistant Secretary', false, 1, 1),
  ('security_officer', 'Chief Security Officer', true, 1, 0),
  ('security_officer', 'Assistant Chief Security Officer', false, 1, 1),
  ('welfare_officer', 'Welfare Officer', true, 1, 0),
  ('trustee', 'Trustee', true, NULL::integer, 0),
  ('security_guard_supervisor', 'Security Guard Supervisor', true, 1, 0)
) AS t(role_name, title, is_principal, seats, sort_order)
JOIN public.app_roles r ON r.name = t.role_name
ON CONFLICT (role_id, name) DO NOTHING;

-- 5, 6 and 7. Role ids are read once into variables; every write below uses them.
DO $seed$
DECLARE
  v_super uuid;
  v_chairman uuid;
  v_financial uuid;
  v_security uuid;
  v_secretary uuid;
  v_welfare uuid;
  v_trustee uuid;
  v_guard uuid;
  v_vice uuid;
  v_project uuid;
  v_resident uuid;
  v_vice_title uuid;
  v_missing text;
  v_count integer;
  v_actor uuid;

  c_chairman_add constant text[] := ARRAY[
    'settings.view', 'settings.manage_general', 'settings.manage_billing',
    'settings.manage_security', 'settings.manage_reference', 'settings.view_audit_logs',
    'system.assign_roles', 'view_projects', 'manage_projects'
  ];
  -- system.view_all_profiles: exception, needed by assign_roles (see header).
  c_chairman_system_kept constant text[] := ARRAY['system.assign_roles', 'system.view_all_profiles'];
  c_officer_add constant text[] := ARRAY['impersonation.start_session', 'impersonation.view_sessions'];
  c_super_only constant text[] := ARRAY[
    'system.assign_board_roles', 'impersonation.approve_requests', 'impersonation.manage_settings'
  ];
  c_welfare constant text[] := ARRAY[
    'residents.view', 'houses.view',
    'announcements.view', 'announcements.create', 'announcements.update', 'announcements.delete',
    'announcements.publish', 'announcements.manage_categories', 'announcements.manage_templates',
    'announcements.emergency_broadcast',
    'notes.view', 'notes.create', 'notes.update', 'notes.delete', 'notes.view_confidential',
    'notifications.view', 'notifications.send', 'notifications.manage', 'notifications.manage_delivery',
    'documents.view',
    'two_factor.enable', 'two_factor.disable'
  ];
  c_trustee constant text[] := ARRAY[
    'residents.view', 'houses.view', 'payments.view', 'billing.view',
    'security.view', 'security.view_logs',
    'reports.view_financial', 'reports.view_occupancy', 'reports.view_security', 'reports.export',
    'approvals.view', 'documents.view', 'documents.view_all', 'announcements.view',
    'notifications.view', 'report_subscriptions.view', 'notes.view', 'email_imports.view',
    'whatsapp.view', 'groups.view', 'view_expenditure', 'view_vendors', 'view_projects',
    'two_factor.view_status', 'two_factor.enable', 'two_factor.disable'
  ];
  c_guard constant text[] := ARRAY[
    'security.view', 'security.generate_codes', 'security.verify_codes', 'security.record_access',
    'security.operate_records', 'security.manage_records',
    'two_factor.enable', 'two_factor.disable'
  ];
  c_resident_types constant text[] := ARRAY[
    'caretaker', 'co_resident', 'contractor', 'developer', 'domestic_staff', 'household_member',
    'non_resident_landlord', 'resident_landlord', 'tenant'
  ];
BEGIN
  SELECT id INTO v_super FROM public.app_roles WHERE name = 'super_admin';
  SELECT id INTO v_chairman FROM public.app_roles WHERE name = 'chairman';
  SELECT id INTO v_financial FROM public.app_roles WHERE name = 'financial_officer';
  SELECT id INTO v_security FROM public.app_roles WHERE name = 'security_officer';
  SELECT id INTO v_secretary FROM public.app_roles WHERE name = 'secretary';
  SELECT id INTO v_welfare FROM public.app_roles WHERE name = 'welfare_officer';
  SELECT id INTO v_trustee FROM public.app_roles WHERE name = 'trustee';
  SELECT id INTO v_guard FROM public.app_roles WHERE name = 'security_guard_supervisor';
  SELECT id INTO v_vice FROM public.app_roles WHERE name = 'vice_chairman';
  SELECT id INTO v_project FROM public.app_roles WHERE name = 'project_manager';
  SELECT id INTO v_resident FROM public.app_roles WHERE name = 'resident';

  IF v_super IS NULL OR v_chairman IS NULL OR v_financial IS NULL OR v_security IS NULL
     OR v_secretary IS NULL OR v_welfare IS NULL OR v_trustee IS NULL OR v_guard IS NULL THEN
    RAISE EXCEPTION 'role model seed: a built-in role is missing';
  END IF;

  -- A misspelt or absent permission would otherwise be skipped silently.
  SELECT string_agg(n, ', ' ORDER BY n) INTO v_missing
  FROM unnest(c_chairman_add || c_chairman_system_kept || c_officer_add || c_super_only
              || c_welfare || c_trustee || c_guard) AS n
  WHERE NOT EXISTS (SELECT 1 FROM public.app_permissions p WHERE p.name = n);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'role model seed: permissions not in app_permissions: %', v_missing;
  END IF;

  -- 5a. super_admin only.
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT v_super, p.id FROM public.app_permissions p WHERE p.name = ANY (c_super_only)
  ON CONFLICT (role_id, permission_id) DO NOTHING;

  DELETE FROM public.role_permissions rp
  USING public.app_permissions p
  WHERE rp.permission_id = p.id
    AND p.name = ANY (c_super_only)
    AND rp.role_id <> v_super;

  -- 5b. chairman: add, then remove impersonation.* and every system.* not kept.
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT v_chairman, p.id FROM public.app_permissions p WHERE p.name = ANY (c_chairman_add)
  ON CONFLICT (role_id, permission_id) DO NOTHING;

  DELETE FROM public.role_permissions rp
  USING public.app_permissions p
  WHERE rp.permission_id = p.id
    AND rp.role_id = v_chairman
    AND (p.name LIKE 'impersonation.%'
         OR (p.name LIKE 'system.%' AND p.name <> ALL (c_chairman_system_kept)));

  -- 5c. financial_officer and security_officer: impersonation for support.
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT r.role_id, p.id
  FROM (VALUES (v_financial), (v_security)) AS r(role_id)
  CROSS JOIN public.app_permissions p
  WHERE p.name = ANY (c_officer_add)
  ON CONFLICT (role_id, permission_id) DO NOTHING;

  -- 5d. The new roles hold exactly their lists.
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT s.role_id, p.id
  FROM (VALUES (v_welfare, c_welfare), (v_trustee, c_trustee), (v_guard, c_guard)) AS s(role_id, perms)
  JOIN public.app_permissions p ON p.name = ANY (s.perms)
  ON CONFLICT (role_id, permission_id) DO NOTHING;

  DELETE FROM public.role_permissions rp
  USING public.app_permissions p,
        (VALUES (v_welfare, c_welfare), (v_trustee, c_trustee), (v_guard, c_guard)) AS s(role_id, perms)
  WHERE rp.permission_id = p.id
    AND rp.role_id = s.role_id
    AND p.name <> ALL (s.perms);

  -- 6. role_assignment_rules: exactly the owner's matrix for the six resident roles.
  -- Rows for vice_chairman, project_manager and resident go with the roles in step 7 (cascade).
  DELETE FROM public.role_assignment_rules
  WHERE app_role_id IN (v_super, v_guard)
     OR (app_role_id IN (v_chairman, v_financial, v_secretary, v_security, v_welfare, v_trustee)
         AND resident_role <> ALL (c_resident_types));

  INSERT INTO public.role_assignment_rules (resident_role, app_role_id, is_allowed)
  SELECT t.resident_role, m.role_id, t.resident_role = ANY (m.allowed)
  FROM unnest(c_resident_types) AS t(resident_role)
  CROSS JOIN (VALUES
    (v_chairman, ARRAY['resident_landlord', 'non_resident_landlord']),
    (v_trustee, ARRAY['resident_landlord', 'non_resident_landlord']),
    (v_security, ARRAY['resident_landlord', 'non_resident_landlord', 'tenant']),
    (v_financial, ARRAY['resident_landlord', 'non_resident_landlord', 'tenant', 'co_resident']),
    (v_secretary, ARRAY['resident_landlord', 'non_resident_landlord', 'tenant', 'co_resident']),
    (v_welfare, ARRAY['resident_landlord', 'non_resident_landlord', 'tenant', 'co_resident'])
  ) AS m(role_id, allowed)
  ON CONFLICT (resident_role, app_role_id) DO UPDATE
    SET is_allowed = EXCLUDED.is_allowed
    WHERE public.role_assignment_rules.is_allowed IS DISTINCT FROM EXCLUDED.is_allowed;

  -- 7. Retire vice_chairman, project_manager and resident. v_actor stays NULL: a migration has
  --    no auth.uid().

  IF v_vice IS NOT NULL THEN
    SELECT id INTO v_vice_title FROM public.admin_titles
    WHERE role_id = v_chairman AND name = 'Vice Chairman';
    IF v_vice_title IS NULL THEN
      RAISE EXCEPTION 'role model seed: the Vice Chairman title is missing';
    END IF;

    SELECT count(*) INTO v_count FROM public.profiles WHERE role_id = v_vice;
    IF v_count > 1 THEN
      RAISE EXCEPTION 'role model seed: % vice_chairman holders, but Vice Chairman has one seat', v_count
        USING HINT = 'Move all but one to another role by hand, then re-run.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE role_id = v_vice AND resident_id IS NULL) THEN
      RAISE EXCEPTION 'role model seed: a vice_chairman holder has no linked resident, so cannot become chairman'
        USING HINT = 'Link the account to its resident, or remove its role by hand, then re-run.';
    END IF;

    WITH moved AS (
      UPDATE public.profiles p
      SET role_id = v_chairman, title_id = v_vice_title
      WHERE p.role_id = v_vice
      RETURNING p.id, p.full_name, p.email
    )
    INSERT INTO public.audit_logs
      (actor_id, action, entity_type, entity_id, entity_display, old_values, new_values, description, metadata)
    SELECT v_actor, 'UPDATE', 'profiles', m.id, coalesce(m.full_name, m.email),
           jsonb_build_object('role_id', v_vice, 'role_name', 'vice_chairman'),
           jsonb_build_object('role_id', v_chairman, 'role_name', 'chairman', 'title_id', v_vice_title),
           'Moved from the retired vice_chairman role to chairman with the title Vice Chairman',
           jsonb_build_object('source', '20261022160000_seed_rbac_role_model', 'issue', 825)
    FROM moved m;
  END IF;

  -- project_manager and resident holders keep their account and lose the role. A plain
  -- resident holds no role and still reaches the portal by resident_id.
  WITH cleared AS (
    UPDATE public.profiles p
    SET role_id = NULL, title_id = NULL
    WHERE p.role_id IN (v_project, v_resident)
    RETURNING p.id, p.full_name, p.email
  ), before AS (
    -- RETURNING shows the new (null) role_id; every CTE shares the pre-update snapshot, so this
    -- reads the old one.
    SELECT p.id, p.role_id,
           CASE WHEN p.role_id = v_project THEN 'project_manager' ELSE 'resident' END AS role_name
    FROM public.profiles p
    WHERE p.role_id IN (v_project, v_resident)
  )
  INSERT INTO public.audit_logs
    (actor_id, action, entity_type, entity_id, entity_display, old_values, new_values, description, metadata)
  SELECT v_actor, 'UNASSIGN', 'profiles', c.id, coalesce(c.full_name, c.email),
         jsonb_build_object('role_id', b.role_id, 'role_name', b.role_name),
         jsonb_build_object('role_id', NULL),
         format('Removed the retired %s role', b.role_name),
         jsonb_build_object('source', '20261022160000_seed_rbac_role_model', 'issue', 825)
  FROM cleared c
  JOIN before b ON b.id = c.id;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE role_id IN (v_vice, v_project, v_resident)) THEN
    RAISE EXCEPTION 'role model seed: a retired role still has holders';
  END IF;

  DELETE FROM public.app_roles WHERE id IN (v_vice, v_project, v_resident);
END
$seed$;

COMMIT;
