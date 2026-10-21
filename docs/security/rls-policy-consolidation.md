# RLS permissive-policy consolidation (#956)

The Supabase performance advisor reports `multiple_permissive_policies` 73 times across 41 tables on
Residio_Stage (rerun 2026-10-21). Where two or more permissive policies apply to the same role and
command, Postgres evaluates every one of them for every row and combines them with OR. This document
is the read-only mapping pass that #956 requires before any migration: for each of the 41 tables, its
permissive policies per role and command, and the combined expression Postgres evaluates today.

## Source and confidence

**Stage must confirm this mapping before any migration based on it is applied.** It was derived without
database access:

- Every file in `supabase/migrations/` was replayed in filename order (`CREATE`, `ALTER` and
  `DROP POLICY`, including statements inside `DO` blocks, and `DROP TABLE`). The latest definition of
  each policy wins.
- The result was checked against `docs/validation/policy-definitions.baseline.json` (Residio_Stage
  capture, 2026-10-16). All 256 public-schema policies in that capture are present with the same
  table, name, command, roles and permissive flag, and no other policy exists on those tables. The
  only policies not in the capture are those created by migrations after 2026-10-16 (`admin_titles`,
  `recipient_groups`, `recipient_group_members`, the document taxonomy tables and the WhatsApp
  `service_role` tables).
- The seven restrictive `Approved accounts only can read` policies are created by dynamic SQL in
  `20260830090000_restrict_reference_reads_to_approved.sql`. They are taken from the capture. They
  are restrictive, so they are not part of this lint and nothing here changes them.
- The expressions shown are the migration source text (the latest `CREATE POLICY` or `ALTER POLICY`),
  not Postgres's normalised `pg_get_expr` output. The capture holds only hashes of the live text, so
  the expressions themselves cannot be checked without the database.
- The model finds the same 41 tables as the advisor. It counts 68 role-and-command overlaps, against
  the advisor's 73, because the advisor also counts a database role this model does not list. A
  `TO public` policy applies to every role; the model expands it to `anon`, `authenticated`,
  `authenticator`, `dashboard_user` and `service_role`.

Confirm the live definitions with:

```sql
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = ANY (ARRAY[<the 41 tables below>])
 ORDER BY tablename, cmd, policyname;
```

## How Postgres combines policies

For one role and one command, Postgres ORs the `USING` expressions of every applicable permissive
policy, and separately ORs their `WITH CHECK` expressions. A policy without `WITH CHECK` uses its
`USING` expression as its check. A `FOR ALL` policy applies to `SELECT`, `INSERT`, `UPDATE` and
`DELETE`, so an `ALL` policy and a `SELECT` policy on the same role overlap on `SELECT`. A `TO public`
policy applies to every role, including `authenticated`, so it overlaps with a `TO authenticated`
policy on the same command.

## Mapping, per table

### `access_codes`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Residents can view own access codes | SELECT | authenticated | `(contact_id IN ( SELECT security_contacts.id FROM security_contacts WHERE (security_contacts.resident_id = (select get_my_resident_id()))))` | — |
| access_codes_delete_policy | DELETE | authenticated | `((select has_permission('security.suspend_revoke'::text)))` | — |
| access_codes_insert_policy | INSERT | authenticated | — | `((select has_permission('security.manage_records'::text)))` |
| access_codes_select_policy | SELECT | authenticated | `((select has_permission('security.operate_records'::text)))` | — |
| access_codes_update_policy | UPDATE | authenticated | `((select has_permission('security.operate_records'::text)))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Residents can view own access codes, access_codes_select_policy
  - USING: `((contact_id IN ( SELECT security_contacts.id FROM security_contacts WHERE (security_contacts.resident_id = (select get_my_resident_id())))) OR (select has_permission('security.operate_records'::text)))`

### `announcement_categories`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| announcement_categories_admin_all | ALL | authenticated | `(select has_permission('announcements.manage_categories'::text))` | `(select has_permission('announcements.manage_categories'::text))` |
| announcement_categories_select_policy | SELECT | authenticated | `is_active = true` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: announcement_categories_admin_all, announcement_categories_select_policy
  - USING: `((select has_permission('announcements.manage_categories'::text)) OR (is_active = true))`

### `announcement_read_receipts`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| read_receipts_admin_select | SELECT | authenticated | `(select has_permission('announcements.publish'::text))` | — |
| read_receipts_own_insert | INSERT | authenticated | — | `(EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = announcement_read_receipts.resident_id) AND (r.profile_id = (select auth.uid())))))` |
| read_receipts_own_select | SELECT | authenticated | `(EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = announcement_read_receipts.resident_id) AND (r.profile_id = (select auth.uid())))))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: read_receipts_admin_select, read_receipts_own_select
  - USING: `((select has_permission('announcements.publish'::text)) OR (EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = announcement_read_receipts.resident_id) AND (r.profile_id = (select auth.uid()))))))`

### `announcements`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| announcements_admin_delete | DELETE | authenticated | `(select has_permission('announcements.delete'::text))` | — |
| announcements_admin_insert | INSERT | authenticated | — | `(select has_permission('announcements.create'::text))` |
| announcements_admin_select | SELECT | authenticated | `(select has_permission('announcements.view'::text))` | — |
| announcements_admin_update | UPDATE | authenticated | `(select has_permission('announcements.update'::text))` | `(select has_permission('announcements.update'::text))` |
| announcements_resident_select | SELECT | authenticated | `((status = 'published'::announcement_status) AND ((expires_at IS NULL) OR (expires_at > now())) AND (EXISTS ( SELECT 1 FROM residents r WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status)))) AND ((target_audience = 'all'::target_audience) OR ((target_audience = 'residents'::target_audience) AND (EXISTS ( SELECT 1 FROM residents r WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status))))) OR ((target_audience = 'owners'::target_audience) AND (EXISTS ( SELECT 1 FROM (residents r JOIN resident_houses rh ON ((rh.resident_id = r.id))) WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.resident_role = ANY (ARRAY['resident_landlord'::resident_role, 'non_resident_landlord'::resident_role])))))) OR ((target_audience = 'tenants'::target_audience) AND (EXISTS ( SELECT 1 FROM (residents r JOIN resident_houses rh ON ((rh.resident_id = r.id))) WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.resident_role = 'tenant'::resident_role))))) OR ((target_audience = 'staff'::target_audience) AND (EXISTS ( SELECT 1 FROM (residents r JOIN resident_houses rh ON ((rh.resident_id = r.id))) WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.resident_role = ANY (ARRAY['domestic_staff'::resident_role, 'caretaker'::resident_role, 'contractor'::resident_role]))))))) AND ((target_houses IS NULL) OR (array_length(target_houses, 1) IS NULL) OR (EXISTS ( SELECT 1 FROM (residents r JOIN resident_houses rh ON ((rh.resident_id = r.id))) WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.house_id = ANY (announcements.target_houses)))))))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: announcements_admin_select, announcements_resident_select
  - USING: `((select has_permission('announcements.view'::text)) OR ((status = 'published'::announcement_status) AND ((expires_at IS NULL) OR (expires_at > now())) AND (EXISTS ( SELECT 1 FROM residents r WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status)))) AND ((target_audience = 'all'::target_audience) OR ((target_audience = 'residents'::target_audience) AND (EXISTS ( SELECT 1 FROM residents r WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status))))) OR ((target_audience = 'owners'::target_audience) AND (EXISTS ( SELECT 1 FROM (residents r JOIN resident_houses rh ON ((rh.resident_id = r.id))) WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.resident_role = ANY (ARRAY['resident_landlord'::resident_role, 'non_resident_landlord'::resident_role])))))) OR ((target_audience = 'tenants'::target_audience) AND (EXISTS ( SELECT 1 FROM (residents r JOIN resident_houses rh ON ((rh.resident_id = r.id))) WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.resident_role = 'tenant'::resident_role))))) OR ((target_audience = 'staff'::target_audience) AND (EXISTS ( SELECT 1 FROM (residents r JOIN resident_houses rh ON ((rh.resident_id = r.id))) WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.resident_role = ANY (ARRAY['domestic_staff'::resident_role, 'caretaker'::resident_role, 'contractor'::resident_role]))))))) AND ((target_houses IS NULL) OR (array_length(target_houses, 1) IS NULL) OR (EXISTS ( SELECT 1 FROM (residents r JOIN resident_houses rh ON ((rh.resident_id = r.id))) WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.house_id = ANY (announcements.target_houses))))))))`

### `approval_requests`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admin and chairman can update approval requests | UPDATE | authenticated | `(select has_permission('approvals.approve_reject'::text))` | `(select has_permission('approvals.approve_reject'::text))` |
| Admin and chairman can view all approval requests | SELECT | authenticated | `(select has_permission('approvals.view'::text))` | — |
| Users can create their own approval requests | INSERT | authenticated | — | `(requested_by = (select auth.uid()))` |
| Users can view their own approval requests | SELECT | authenticated | `(requested_by = (select auth.uid()))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admin and chairman can view all approval requests, Users can view their own approval requests
  - USING: `((select has_permission('approvals.view'::text)) OR (requested_by = (select auth.uid())))`

### `billing_items`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins chairmen fin sec can manage billing items | ALL | authenticated | `((select has_permission('billing.write_profiles'::text)))` | — |
| All authenticated can view billing items | SELECT | authenticated | `true` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admins chairmen fin sec can manage billing items, All authenticated can view billing items
  - USING: `true`

### `billing_profiles`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins chairmen fin sec can manage billing profiles | ALL | authenticated | `((select has_permission('billing.write_profiles'::text)))` | — |
| All authenticated can view billing profiles | SELECT | authenticated | `true` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admins chairmen fin sec can manage billing profiles, All authenticated can view billing profiles
  - USING: `true`

### `budgets`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Manage Budgets - Authorized Roles | ALL | authenticated | `(select has_permission('manage_expenditure'::text))` | `(select has_permission('manage_expenditure'::text))` |
| View Budgets - Authorized Roles | SELECT | authenticated | `(select has_permission('view_expenditure'::text))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Manage Budgets - Authorized Roles, View Budgets - Authorized Roles
  - USING: `((select has_permission('manage_expenditure'::text)) OR (select has_permission('view_expenditure'::text)))`

### `document_categories`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins can manage categories | ALL | authenticated | `(EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'documents.manage_categories'::text))))` | — |
| Authenticated users can view active categories | SELECT | authenticated | `is_active = TRUE` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admins can manage categories, Authenticated users can view active categories
  - USING: `((EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'documents.manage_categories'::text)))) OR (is_active = TRUE))`

### `document_custom_field_values`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Custom field values follow document visibility | SELECT | authenticated | `EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_custom_field_values.document_id)` | — |
| Editors can write custom field values | ALL | authenticated | `((select has_permission('documents.update'::text)) AND (EXISTS ( SELECT 1 FROM documents d WHERE (d.id = document_custom_field_values.document_id))))` | `((select has_permission('documents.update'::text)) AND (EXISTS ( SELECT 1 FROM documents d WHERE (d.id = document_custom_field_values.document_id))))` |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Custom field values follow document visibility, Editors can write custom field values
  - USING: `((EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_custom_field_values.document_id)) OR ((select has_permission('documents.update'::text)) AND (EXISTS ( SELECT 1 FROM documents d WHERE (d.id = document_custom_field_values.document_id)))))`

### `document_custom_fields`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Custom field managers can manage custom fields | ALL | authenticated | `(select has_permission('documents.manage_custom_fields'::text))` | `(select has_permission('documents.manage_custom_fields'::text))` |
| Document viewers can view active custom fields | SELECT | authenticated | `((is_active = true) AND (select has_permission('documents.view'::text)))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Custom field managers can manage custom fields, Document viewers can view active custom fields
  - USING: `((select has_permission('documents.manage_custom_fields'::text)) OR ((is_active = true) AND (select has_permission('documents.view'::text))))`

### `document_tags`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Document viewers can view active tags | SELECT | authenticated | `((is_active = true) AND (select has_permission('documents.view'::text)))` | — |
| Tag managers can manage tags | ALL | authenticated | `(select has_permission('documents.manage_tags'::text))` | `(select has_permission('documents.manage_tags'::text))` |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Document viewers can view active tags, Tag managers can manage tags
  - USING: `(((is_active = true) AND (select has_permission('documents.view'::text))) OR (select has_permission('documents.manage_tags'::text)))`

### `estate_bank_accounts`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins chairmen fin sec can manage bank accounts | ALL | public | `((select has_permission('payments.manage_reference_records'::text)))` | — |
| All authenticated can view active bank accounts | SELECT | public | `((is_active = true) OR ((select has_permission('payments.manage_reference_records'::text))))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for anon, authenticated, authenticator, dashboard_user, service_role: Admins chairmen fin sec can manage bank accounts, All authenticated can view active bank accounts
  - USING: `((select has_permission('payments.manage_reference_records'::text)) OR (is_active = true))`

### `expense_categories`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Manage Categories - Authorized Roles | ALL | authenticated | `(select has_permission('manage_expenditure'::text))` | `(select has_permission('manage_expenditure'::text))` |
| View Categories - Authorized Roles | SELECT | authenticated | `(select has_permission('view_expenditure'::text))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Manage Categories - Authorized Roles, View Categories - Authorized Roles
  - USING: `((select has_permission('manage_expenditure'::text)) OR (select has_permission('view_expenditure'::text)))`

### `expenses`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Manage Expenditure - Authorized Roles | ALL | authenticated | `(select has_permission('manage_expenditure'::text))` | `(select has_permission('manage_expenditure'::text))` |
| View Expenditure - Admins/Financial Secretary | SELECT | authenticated | `(select has_permission('view_expenditure'::text))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Manage Expenditure - Authorized Roles, View Expenditure - Admins/Financial Secretary
  - USING: `((select has_permission('manage_expenditure'::text)) OR (select has_permission('view_expenditure'::text)))`

### `hierarchical_settings`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| hierarchical_settings_admin_all | ALL | authenticated | `((select has_permission('settings.write_system'::text)))` | — |
| hierarchical_settings_read_estate | SELECT | authenticated | `level = 'estate'` | — |
| hierarchical_settings_read_house | SELECT | authenticated | `level = 'house'` | — |
| hierarchical_settings_read_own_resident | SELECT | authenticated | `((level = 'resident'::setting_level) AND (resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid())))))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: hierarchical_settings_admin_all, hierarchical_settings_read_estate, hierarchical_settings_read_house, hierarchical_settings_read_own_resident
  - USING: `((select has_permission('settings.write_system'::text)) OR (level = 'estate') OR (level = 'house') OR ((level = 'resident'::setting_level) AND (resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid()))))))`

### `houses`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins chairmen and fin sec can delete houses | DELETE | public | `((select has_permission('houses.manage_records'::text)))` | — |
| Admins chairmen and fin sec can insert houses | INSERT | public | — | `((select has_permission('houses.manage_records'::text)))` |
| Admins chairmen and fin sec can update houses | UPDATE | public | `((select has_permission('houses.manage_records'::text)))` | — |
| All authenticated users can view active houses | SELECT | public | `((is_active = true) OR ((select has_permission('houses.manage_records'::text))))` | — |
| Residents can view assigned houses | SELECT | authenticated | `(id IN ( SELECT resident_houses.house_id FROM resident_houses WHERE ((resident_houses.resident_id = (select get_my_resident_id())) AND (resident_houses.is_active = true))))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: All authenticated users can view active houses, Residents can view assigned houses
  - USING: `((is_active = true) OR (select has_permission('houses.manage_records'::text)) OR (id IN ( SELECT resident_houses.house_id FROM resident_houses WHERE ((resident_houses.resident_id = (select get_my_resident_id())) AND (resident_houses.is_active = true)))))`

### `impersonation_sessions`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| admins_insert_own_impersonation_sessions | INSERT | authenticated | — | `(admin_profile_id = (select auth.uid()))` |
| admins_read_own_impersonation_sessions | SELECT | authenticated | `(admin_profile_id = (select auth.uid()))` | — |
| admins_update_own_impersonation_sessions | UPDATE | authenticated | `(admin_profile_id = (select auth.uid()))` | `(admin_profile_id = (select auth.uid()))` |
| super_admin_read_all_impersonation_sessions | SELECT | authenticated | `(select has_permission('impersonation.view_sessions'::text))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: admins_read_own_impersonation_sessions, super_admin_read_all_impersonation_sessions
  - USING: `((admin_profile_id = (select auth.uid())) OR (select has_permission('impersonation.view_sessions'::text)))`

### `invoice_items`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins chairmen fin sec can manage all invoice items | ALL | public | `((select has_permission('billing.create_invoice'::text)))` | — |
| Residents can view own invoice items | SELECT | authenticated | `(invoice_id IN ( SELECT invoices.id FROM invoices WHERE (invoices.resident_id = (select get_my_resident_id()))))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admins chairmen fin sec can manage all invoice items, Residents can view own invoice items
  - USING: `((select has_permission('billing.create_invoice'::text)) OR (invoice_id IN ( SELECT invoices.id FROM invoices WHERE (invoices.resident_id = (select get_my_resident_id())))))`

### `invoices`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins chairmen fin sec can manage all invoices | ALL | public | `((select has_permission('billing.create_invoice'::text)))` | — |
| Residents can view own invoices | SELECT | authenticated | `(resident_id = (select get_my_resident_id()))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admins chairmen fin sec can manage all invoices, Residents can view own invoices
  - USING: `((select has_permission('billing.create_invoice'::text)) OR (resident_id = (select get_my_resident_id())))`

### `message_templates`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| message_templates_admin_all | ALL | authenticated | `(select has_permission('announcements.manage_templates'::text))` | `(select has_permission('announcements.manage_templates'::text))` |
| message_templates_select_policy | SELECT | authenticated | `is_active = true` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: message_templates_admin_all, message_templates_select_policy
  - USING: `((select has_permission('announcements.manage_templates'::text)) OR (is_active = true))`

### `notification_preferences`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Residents can update own notification preferences | UPDATE | authenticated | `(resident_id = (select get_my_resident_id()))` | `(resident_id = (select get_my_resident_id()))` |
| Residents can view own notification preferences | SELECT | authenticated | `(resident_id = (select get_my_resident_id()))` | — |
| notification_preferences_delete | DELETE | authenticated | `((select has_permission('notifications.manage'::text)))` | — |
| notification_preferences_insert | INSERT | authenticated | — | `((select has_permission('notifications.manage_delivery'::text)))` |
| notification_preferences_select | SELECT | authenticated | `((select has_permission('notifications.view'::text)) OR (select has_permission('residents.view'::text)) OR (resident_id = (select get_my_resident_id())))` | — |
| notification_preferences_update | UPDATE | authenticated | `((select has_permission('notifications.manage_delivery'::text)))` | `((select has_permission('notifications.manage_delivery'::text)))` |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Residents can view own notification preferences, notification_preferences_select
  - USING: `((resident_id = (select get_my_resident_id())) OR (select has_permission('notifications.view'::text)) OR (select has_permission('residents.view'::text)))`
- **UPDATE** for authenticated: Residents can update own notification preferences, notification_preferences_update
  - USING: `((resident_id = (select get_my_resident_id())) OR (select has_permission('notifications.manage_delivery'::text)))`
  - WITH CHECK: `((resident_id = (select get_my_resident_id())) OR (select has_permission('notifications.manage_delivery'::text)))`

### `payment_records`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins and FinSec can manage all payments | ALL | authenticated | `(select has_permission('payments.update'::text))` | `(select has_permission('payments.update'::text))` |
| Residents can view own payments | SELECT | authenticated | `(resident_id = (select get_my_resident_id()))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admins and FinSec can manage all payments, Residents can view own payments
  - USING: `((select has_permission('payments.update'::text)) OR (resident_id = (select get_my_resident_id())))`

### `paystack_transactions`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| paystack_transactions_admin_all | ALL | authenticated | `(select has_permission('payments.update'::text))` | `(select has_permission('payments.update'::text))` |
| paystack_transactions_resident_select | SELECT | public | `(resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid()))))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: paystack_transactions_admin_all, paystack_transactions_resident_select
  - USING: `((select has_permission('payments.update'::text)) OR (resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid())))))`

### `petty_cash_accounts`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins can manage petty cash accounts | ALL | authenticated | `(select has_permission('manage_expenditure'::text))` | `(select has_permission('manage_expenditure'::text))` |
| petty_cash_accounts_select | SELECT | authenticated | `((select has_permission('view_expenditure'::text)) OR (select has_permission('billing.view'::text)))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admins can manage petty cash accounts, petty_cash_accounts_select
  - USING: `((select has_permission('manage_expenditure'::text)) OR (select has_permission('view_expenditure'::text)) OR (select has_permission('billing.view'::text)))`

### `profiles`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins and chairmen can view all profiles | SELECT | public | `((select has_permission('system.view_all_profiles'::text)))` | — |
| Admins can delete profiles | DELETE | public | `((select has_permission('system.assign_roles'::text)))` | — |
| Admins can insert profiles | INSERT | public | — | `((select has_permission('system.assign_roles'::text)))` |
| Users can update own profile | UPDATE | public | `((select auth.uid()) = id)` | `((select auth.uid()) = id)` |
| Users can view own profile | SELECT | public | `((select auth.uid()) = id)` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for anon, authenticated, authenticator, dashboard_user, service_role: Admins and chairmen can view all profiles, Users can view own profile
  - USING: `((select has_permission('system.view_all_profiles'::text)) OR ((select auth.uid()) = id))`

### `project_milestones`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Manage Milestones - Admins/Project Manager | ALL | authenticated | `(select has_permission('manage_projects'::text))` | `(select has_permission('manage_projects'::text))` |
| View Milestones - Admins/EXCO | SELECT | authenticated | `(select has_permission('view_projects'::text))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Manage Milestones - Admins/Project Manager, View Milestones - Admins/EXCO
  - USING: `((select has_permission('manage_projects'::text)) OR (select has_permission('view_projects'::text)))`

### `projects`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Manage Projects - Admins/Project Manager | ALL | authenticated | `(select has_permission('manage_projects'::text))` | `(select has_permission('manage_projects'::text))` |
| View Projects - Admins/EXCO | SELECT | authenticated | `(select has_permission('view_projects'::text))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Manage Projects - Admins/Project Manager, View Projects - Admins/EXCO
  - USING: `((select has_permission('manage_projects'::text)) OR (select has_permission('view_projects'::text)))`

### `recipient_group_members`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| recipient_group_members_select | SELECT | authenticated | `(select has_permission('groups.view'))` | — |
| recipient_group_members_write | ALL | authenticated | `(select has_permission('groups.manage'))` | `(select has_permission('groups.manage'))` |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: recipient_group_members_select, recipient_group_members_write
  - USING: `((select has_permission('groups.view')) OR (select has_permission('groups.manage')))`

### `recipient_groups`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| recipient_groups_select | SELECT | authenticated | `(select has_permission('groups.view'))` | — |
| recipient_groups_write | ALL | authenticated | `(select has_permission('groups.manage'))` | `(select has_permission('groups.manage'))` |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: recipient_groups_select, recipient_groups_write
  - USING: `((select has_permission('groups.view')) OR (select has_permission('groups.manage')))`

### `report_subscriptions`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| report_subscriptions_admin_insert | INSERT | authenticated | — | `(select has_permission('report_subscriptions.manage'::text))` |
| report_subscriptions_admin_select | SELECT | authenticated | `(select has_permission('report_subscriptions.view'::text))` | — |
| report_subscriptions_admin_update | UPDATE | authenticated | `(select has_permission('report_subscriptions.manage'::text))` | `(select has_permission('report_subscriptions.manage'::text))` |
| report_subscriptions_own_insert | INSERT | authenticated | — | `(EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid())))))` |
| report_subscriptions_own_select | SELECT | authenticated | `(EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid())))))` | — |
| report_subscriptions_own_update | UPDATE | authenticated | `(EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid())))))` | `(EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid())))))` |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: report_subscriptions_admin_select, report_subscriptions_own_select
  - USING: `((select has_permission('report_subscriptions.view'::text)) OR (EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid()))))))`
- **INSERT** for authenticated: report_subscriptions_admin_insert, report_subscriptions_own_insert
  - WITH CHECK: `((select has_permission('report_subscriptions.manage'::text)) OR (EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid()))))))`
- **UPDATE** for authenticated: report_subscriptions_admin_update, report_subscriptions_own_update
  - USING: `((select has_permission('report_subscriptions.manage'::text)) OR (EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid()))))))`
  - WITH CHECK: `((select has_permission('report_subscriptions.manage'::text)) OR (EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid()))))))`

### `resident_houses`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins chairmen fin sec can delete resident houses | DELETE | public | `((select has_permission('houses.manage_records'::text)))` | — |
| Admins chairmen fin sec can insert resident houses | INSERT | public | — | `((select has_permission('houses.manage_records'::text)))` |
| Admins chairmen fin sec can update resident houses | UPDATE | public | `((select has_permission('houses.manage_records'::text)))` | — |
| Admins chairmen fin sec can view all resident houses | SELECT | public | `((select has_permission('houses.manage_records'::text)))` | — |
| Residents can view housemates house assignments | SELECT | authenticated | `house_id IN (SELECT get_my_house_ids())` | — |
| Residents can view own house assignments | SELECT | authenticated | `(resident_id = (select get_my_resident_id()))` | — |
| Security officers can view active resident houses | SELECT | public | `(((select has_permission('security.view_active_residents'::text))) AND (is_active = true))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for anon, authenticator, dashboard_user, service_role: Admins chairmen fin sec can view all resident houses, Security officers can view active resident houses
  - USING: `((select has_permission('houses.manage_records'::text)) OR (((select has_permission('security.view_active_residents'::text))) AND (is_active = true)))`
- **SELECT** for authenticated: Admins chairmen fin sec can view all resident houses, Residents can view housemates house assignments, Residents can view own house assignments, Security officers can view active resident houses
  - USING: `((select has_permission('houses.manage_records'::text)) OR (house_id IN (SELECT get_my_house_ids())) OR (resident_id = (select get_my_resident_id())) OR (((select has_permission('security.view_active_residents'::text))) AND (is_active = true)))`

### `resident_wallets`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins chairmen fin sec can manage wallets | ALL | public | `((select has_permission('billing.manage_wallets'::text)))` | — |
| Residents can view own wallet | SELECT | authenticated | `(resident_id = (select get_my_resident_id()))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admins chairmen fin sec can manage wallets, Residents can view own wallet
  - USING: `((select has_permission('billing.manage_wallets'::text)) OR (resident_id = (select get_my_resident_id())))`

### `residents`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins chairmen fin sec can insert residents | INSERT | public | — | `((select has_permission('residents.manage_records'::text)))` |
| Admins chairmen fin sec can update residents | UPDATE | public | `((select has_permission('residents.manage_records'::text)))` | — |
| Admins chairmen fin sec can view all residents | SELECT | public | `((select has_permission('residents.manage_records'::text)))` | — |
| Only admins can delete residents | DELETE | public | `((select has_permission('residents.delete_records'::text)))` | — |
| Residents can update own contact info | UPDATE | authenticated | `(id = (select get_my_resident_id()))` | `(id = (select get_my_resident_id()))` |
| Residents can view housemates | SELECT | authenticated | `(id IN ( SELECT rh2.resident_id FROM resident_houses rh2 WHERE ((rh2.house_id IN ( SELECT rh1.house_id FROM resident_houses rh1 WHERE ((rh1.resident_id = (select get_my_resident_id())) AND (rh1.is_active = true)))) AND (rh2.is_active = true))))` | — |
| Residents can view own record | SELECT | authenticated | `(id = (select get_my_resident_id()))` | — |
| Security officers can view active residents | SELECT | public | `(((select has_permission('security.view_active_residents'::text))) AND (account_status = 'active'::account_status))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for anon, authenticator, dashboard_user, service_role: Admins chairmen fin sec can view all residents, Security officers can view active residents
  - USING: `((select has_permission('residents.manage_records'::text)) OR (((select has_permission('security.view_active_residents'::text))) AND (account_status = 'active'::account_status)))`
- **SELECT** for authenticated: Admins chairmen fin sec can view all residents, Residents can view housemates, Residents can view own record, Security officers can view active residents
  - USING: `((select has_permission('residents.manage_records'::text)) OR (id IN ( SELECT rh2.resident_id FROM resident_houses rh2 WHERE ((rh2.house_id IN ( SELECT rh1.house_id FROM resident_houses rh1 WHERE ((rh1.resident_id = (select get_my_resident_id())) AND (rh1.is_active = true)))) AND (rh2.is_active = true)))) OR (id = (select get_my_resident_id())) OR (((select has_permission('security.view_active_residents'::text))) AND (account_status = 'active'::account_status)))`
- **UPDATE** for authenticated: Admins chairmen fin sec can update residents, Residents can update own contact info
  - USING: `((select has_permission('residents.manage_records'::text)) OR (id = (select get_my_resident_id())))`
  - WITH CHECK: `((select has_permission('residents.manage_records'::text)) OR (id = (select get_my_resident_id())))`

### `role_assignment_rules`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins can manage role assignment rules | ALL | authenticated | `(EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'system.manage_roles'::text))))` | — |
| role_assignment_rules_select | SELECT | authenticated | `((select has_permission('system.manage_roles'::text)) OR (select has_permission('system.assign_roles'::text)))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admins can manage role assignment rules, role_assignment_rules_select
  - USING: `((EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'system.manage_roles'::text)))) OR (select has_permission('system.manage_roles'::text)) OR (select has_permission('system.assign_roles'::text)))`

### `security_contacts`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Residents can create own security contacts | INSERT | authenticated | — | `(resident_id = (select get_my_resident_id()))` |
| Residents can delete own security contacts | DELETE | authenticated | `(resident_id = (select get_my_resident_id()))` | — |
| Residents can update own security contacts | UPDATE | authenticated | `(resident_id = (select get_my_resident_id()))` | `(resident_id = (select get_my_resident_id()))` |
| Residents can view own security contacts | SELECT | authenticated | `(resident_id = (select get_my_resident_id()))` | — |
| security_contacts_delete_policy | DELETE | authenticated | `((select has_permission('security.suspend_revoke'::text)))` | — |
| security_contacts_insert_policy | INSERT | authenticated | — | `((select has_permission('security.manage_records'::text)))` |
| security_contacts_select_policy | SELECT | authenticated | `((select has_permission('security.operate_records'::text)))` | — |
| security_contacts_update_policy | UPDATE | authenticated | `((select has_permission('security.manage_records'::text)))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Residents can view own security contacts, security_contacts_select_policy
  - USING: `((resident_id = (select get_my_resident_id())) OR (select has_permission('security.operate_records'::text)))`
- **INSERT** for authenticated: Residents can create own security contacts, security_contacts_insert_policy
  - WITH CHECK: `((resident_id = (select get_my_resident_id())) OR (select has_permission('security.manage_records'::text)))`
- **UPDATE** for authenticated: Residents can update own security contacts, security_contacts_update_policy
  - USING: `((resident_id = (select get_my_resident_id())) OR (select has_permission('security.manage_records'::text)))`
  - WITH CHECK: `((resident_id = (select get_my_resident_id())) OR (select has_permission('security.manage_records'::text)))`
- **DELETE** for authenticated: Residents can delete own security contacts, security_contacts_delete_policy
  - USING: `((resident_id = (select get_my_resident_id())) OR (select has_permission('security.suspend_revoke'::text)))`

### `two_factor_audit_log`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins can view all audit logs | SELECT | authenticated | `(select has_permission('two_factor.view_audit_log'::text))` | — |
| System can manage audit logs | ALL | service_role | `true` | — |
| Users can view own audit log | SELECT | authenticated | `(profile_id = (select auth.uid()))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admins can view all audit logs, Users can view own audit log
  - USING: `((select has_permission('two_factor.view_audit_log'::text)) OR (profile_id = (select auth.uid())))`

### `vendors`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Manage Vendors - Authorized Roles | ALL | authenticated | `(select has_permission('manage_vendors'::text))` | `(select has_permission('manage_vendors'::text))` |
| View Vendors - Authorized Roles | SELECT | authenticated | `(select has_permission('view_vendors'::text))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Manage Vendors - Authorized Roles, View Vendors - Authorized Roles
  - USING: `((select has_permission('manage_vendors'::text)) OR (select has_permission('view_vendors'::text)))`

### `wallet_payment_batch_items`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admin finance can manage wallet payment batch items | ALL | authenticated | `(select has_permission('billing.manage_wallets'::text))` | `(select has_permission('billing.manage_wallets'::text))` |
| Residents can view own wallet payment batch items | SELECT | public | `(batch_id IN ( SELECT wallet_payment_batches.id FROM wallet_payment_batches WHERE (wallet_payment_batches.resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid()))))))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admin finance can manage wallet payment batch items, Residents can view own wallet payment batch items
  - USING: `((select has_permission('billing.manage_wallets'::text)) OR (batch_id IN ( SELECT wallet_payment_batches.id FROM wallet_payment_batches WHERE (wallet_payment_batches.resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid())))))))`

### `wallet_payment_batches`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admin finance can manage wallet payment batches | ALL | authenticated | `(select has_permission('billing.manage_wallets'::text))` | `(select has_permission('billing.manage_wallets'::text))` |
| Residents can view own wallet payment batches | SELECT | public | `(resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid()))))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admin finance can manage wallet payment batches, Residents can view own wallet payment batches
  - USING: `((select has_permission('billing.manage_wallets'::text)) OR (resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid())))))`

### `wallet_transactions`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins chairmen fin sec can view all transactions | ALL | public | `((select has_permission('billing.manage_wallets'::text)))` | — |
| Residents can view own transactions | SELECT | public | `(wallet_id IN ( SELECT w.id FROM (resident_wallets w JOIN residents r ON ((r.id = w.resident_id))) WHERE (r.profile_id = (select auth.uid()))))` | — |
| Residents can view own wallet transactions | SELECT | authenticated | `(wallet_id IN ( SELECT resident_wallets.id FROM resident_wallets WHERE (resident_wallets.resident_id = (select get_my_resident_id()))))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for anon, authenticator, dashboard_user, service_role: Admins chairmen fin sec can view all transactions, Residents can view own transactions
  - USING: `((select has_permission('billing.manage_wallets'::text)) OR (wallet_id IN ( SELECT w.id FROM (resident_wallets w JOIN residents r ON ((r.id = w.resident_id))) WHERE (r.profile_id = (select auth.uid())))))`
- **SELECT** for authenticated: Admins chairmen fin sec can view all transactions, Residents can view own transactions, Residents can view own wallet transactions
  - USING: `((select has_permission('billing.manage_wallets'::text)) OR (wallet_id IN ( SELECT w.id FROM (resident_wallets w JOIN residents r ON ((r.id = w.resident_id))) WHERE (r.profile_id = (select auth.uid())))) OR (wallet_id IN ( SELECT resident_wallets.id FROM resident_wallets WHERE (resident_wallets.resident_id = (select get_my_resident_id())))))`

