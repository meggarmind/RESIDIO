# RBAC Permissions Audit

**Date**: 2025-12-30
**Phase**: Core Infrastructure
**Status**: Complete

---

## Executive Summary

Residio uses a modern, flexible RBAC system (implemented in Phase 10) with:
- **47 granular permissions** across 11 functional categories
- **8 roles** (see section 3 for the current set)
- **Server-side authorization** via `authorizePermission()` function
- **Middleware route protection** with permission checks
- **Audit logging** for all RBAC operations

---

## 1. Permission Categories & Inventory

### Complete Permission List (47 permissions)

| Category | Permission | Display Name | Description |
|----------|------------|--------------|-------------|
| **Residents** | `residents.view` | View Residents | View resident list and details |
| | `residents.create` | Create Residents | Add new residents |
| | `residents.update` | Update Residents | Edit resident information |
| | `residents.delete` | Delete Residents | Remove residents |
| | `residents.verify` | Verify Residents | Verify identity documents |
| | `residents.export` | Export Residents | Export to CSV/Excel |
| **Houses** | `houses.view` | View Properties | View property list |
| | `houses.create` | Create Properties | Add new properties |
| | `houses.update` | Update Properties | Edit property information |
| | `houses.delete` | Delete Properties | Remove properties |
| | `houses.assign_resident` | Assign Residents | Link residents to properties |
| **Payments** | `payments.view` | View Payments | View payment records |
| | `payments.create` | Create Payments | Record new transactions |
| | `payments.update` | Update Payments | Edit payment records |
| | `payments.delete` | Delete Payments | Remove payment records |
| | `payments.bulk_update` | Bulk Update Payments | Batch update multiple |
| | `payments.export` | Export Payments | Export data |
| | `payments.manage` | Manage Payments | Full payment management |
| **Billing** | `billing.view` | View Billing | View invoices and profiles |
| | `billing.create_invoice` | Create Invoices | Generate invoices |
| | `billing.void_invoice` | Void Invoices | Cancel invoices |
| | `billing.manage_profiles` | Manage Profiles | Create/edit billing profiles |
| | `billing.apply_late_fees` | Apply Late Fees | Apply fees |
| | `billing.manage_wallets` | Manage Wallets | Adjust balances |
| **Security** | `security.view` | View Security | View security contacts |
| | `security.register_contacts` | Register Contacts | Add new contacts |
| | `security.update_contacts` | Update Contacts | Edit contacts |
| | `security.suspend_revoke` | Suspend/Revoke | Suspend/revoke access |
| | `security.generate_codes` | Generate Codes | Generate access codes |
| | `security.verify_codes` | Verify Codes | Verify codes |
| | `security.record_access` | Record Access | Record gate logs |
| | `security.view_logs` | View Logs | View access history |
| | `security.export` | Export Security | Export data |
| | `security.manage_categories` | Manage Categories | Configure categories |
| **Reports** | `reports.view_financial` | Financial Reports | View financial reports |
| | `reports.view_occupancy` | Occupancy Reports | View property reports |
| | `reports.view_security` | Security Reports | View security reports |
| | `reports.export` | Export Reports | Export to PDF/Excel |
| **Settings** | `settings.view` | View Settings | View settings |
| | `settings.manage_general` | Manage General | Edit general settings |
| | `settings.manage_billing` | Manage Billing | Configure billing |
| | `settings.manage_security` | Manage Security | Configure security |
| | `settings.manage_reference` | Manage Reference | Edit reference data |
| | `settings.view_audit_logs` | View Audit Logs | Access audit trail |
| **Imports** | `imports.create` | Create Imports | Upload bank statements |
| | `imports.review` | Review Imports | Match transactions |
| | `imports.approve` | Approve Imports | Approve for creation |
| | `imports.reject` | Reject Imports | Reject batches |
| **Approvals** | `approvals.view` | View Approvals | View pending requests |
| | `approvals.approve_reject` | Approve/Reject | Approve/reject requests |
| **Documents** | `documents.view` | View Documents | View document library |
| | `documents.upload` | Upload Documents | Upload new documents |
| | `documents.update` | Update Documents | Edit document metadata |
| | `documents.delete` | Delete Documents | Remove documents |
| | `documents.manage_categories` | Manage Categories | Configure categories |
| **System** | `system.manage_roles` | Manage Roles | Create/configure roles |
| | `system.assign_roles` | Assign Roles | Assign roles to users |
| | `system.manage_maintenance` | Manage Maintenance | Maintenance mode |
| | `system.manage_data_retention` | Manage Data | Data retention policies |
| | `system.view_all_settings` | View All Settings | All system config |

---

## 2. Naming Convention

### Pattern: `{module}.{action}`

All permissions follow the pattern:
- **Module**: Lowercase singular noun (residents, houses, payments, etc.)
- **Action**: Lowercase verb or verb phrase (view, create, update, delete, manage_*)

### Examples
```
residents.view          # View action on residents module
billing.create_invoice  # Compound action with underscore
system.manage_roles     # Admin action with manage_ prefix
```

### Compound Actions
- `manage_*` - Full CRUD + configuration for sub-entity
- `view_*` - View-only for specific sub-type (reports.view_financial)
- `*_reject` - Dual action (approvals.approve_reject)

---

## 3. Role Hierarchy

Replaced in the RBAC redesign (#822, slice 3: `20261022160000_seed_rbac_role_model.sql`). The
`vice_chairman`, `project_manager` and `resident` roles are deleted. Counts were measured on
Residio_Stage after slice 3 (2026-10-21). The permission total is now 127 (the "47" in the
summary and in section 1 is the December 2025 inventory). The matrix in section 4 predates the
redesign and is superseded by the counts and changes below until it is regenerated.

| Role | Category | System Role | Requires resident | Permissions |
|------|----------|-------------|-------------------|-------------|
| `super_admin` | exco | Yes | No | 127 (all) |
| `chairman` | exco | No | Yes | 112 |
| `financial_officer` | exco | No | Yes | 60 |
| `secretary` | exco | No | Yes | 25 |
| `security_officer` | exco | No | Yes | 26 |
| `welfare_officer` | exco | Yes | Yes | 22 |
| `trustee` | bot | Yes | Yes | 26 |
| `security_guard_supervisor` | staff | Yes | No | 8 |

The `level` column is gone; account guards are permission-based (`system.assign_roles` and
`system.assign_board_roles`, #826).

### Titles and seats

| Role | Titles (seats) |
|------|----------------|
| `chairman` | Chairman (1), Vice Chairman (1) |
| `financial_officer` | Treasurer (1), Financial Secretary (1) |
| `secretary` | Secretary (1), Assistant Secretary (1) |
| `security_officer` | Chief Security Officer (1), Assistant Chief Security Officer (1) |
| `welfare_officer` | Welfare Officer (1) |
| `trustee` | Trustee (unlimited) |
| `security_guard_supervisor` | Security Guard Supervisor (1) |

### Assignment matrix (allowed resident types)

| Role | resident_landlord | non_resident_landlord | tenant | co_resident |
|------|:-:|:-:|:-:|:-:|
| `chairman`, `trustee` | ✅ | ✅ | ❌ | ❌ |
| `security_officer` | ✅ | ✅ | ✅ | ❌ |
| `financial_officer`, `secretary`, `welfare_officer` | ✅ | ✅ | ✅ | ✅ |

`super_admin` and `security_guard_supervisor` have no rows (non-resident roles; no row means
allowed).

### Rules

- One role per person.
- An estate officer must be a resident: a `requires_resident` role is refused on a profile with
  no linked resident, and the profile loses the role if its resident leaves `active`.
- Only the Super Administrator grants Super Administrator, Chairman or Trustee
  (`system.assign_board_roles`, held by `super_admin` only).
- `impersonation.approve_requests` and `impersonation.manage_settings` are `super_admin` only.
- Account guards are permission-based. Granting `super_admin`, `chairman` or `trustee`, or
  changing an account that holds `super_admin` or `chairman`, needs `system.assign_board_roles`;
  anything else needs `system.assign_roles` (`src/lib/auth/account-guards.ts`, #826). The
  database enforces the same rule on every profile insert, delete and role change made by a
  signed-in caller (trigger `profiles_enforce_role_rules`, #991).

### Permission changes (slice 3, #825)

| Role | Gains | Loses |
|------|-------|-------|
| `chairman` | `settings.view`, `settings.manage_general`, `settings.manage_billing`, `settings.manage_security`, `settings.manage_reference`, `settings.view_audit_logs`, `system.assign_roles`, `view_projects`, `manage_projects` | all four `impersonation.*`; every `system.*` except `system.assign_roles` and `system.view_all_profiles` |
| `financial_officer` | `impersonation.start_session`, `impersonation.view_sessions` | `impersonation.approve_requests` (if held) |
| `security_officer` | `impersonation.start_session`, `impersonation.view_sessions` | none |
| `secretary` | none | none |
| `super_admin` | `system.assign_board_roles` (new, exclusive) | none |

---

## 4. Role-Permission Matrix

> **Historical (2025-12-30).** This matrix is the pre-redesign snapshot. Its Vice Chair, Project Mgr and Resident columns are roles that were deleted in slice 3 (#825) and are not current. For the current roles, counts and permission changes, use section 3.

### Legend
- ✅ = Has permission
- ❌ = Does not have permission

| Permission | Super Admin | Chairman | Vice Chair | Finance | Security | Secretary | Project Mgr | Resident |
|------------|:-----------:|:--------:|:----------:|:-------:|:--------:|:---------:|:-----------:|:--------:|
| **Residents** |
| residents.view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| residents.create | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| residents.update | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| residents.delete | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| residents.verify | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| residents.export | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Houses** |
| houses.view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| houses.create | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| houses.update | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| houses.delete | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| houses.assign_resident | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Payments** |
| payments.view | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| payments.create | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| payments.update | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| payments.delete | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| payments.bulk_update | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| payments.export | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Billing** |
| billing.view | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| billing.create_invoice | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| billing.void_invoice | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| billing.manage_profiles | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| billing.apply_late_fees | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| billing.manage_wallets | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Security** |
| security.* (all 10) | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Reports** |
| reports.view_financial | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| reports.view_occupancy | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| reports.view_security | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| reports.export | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| **Settings** |
| settings.view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| settings.manage_* | ✅ | ✅ | ✅ | billing | security | reference | ❌ | ❌ |
| settings.view_audit_logs | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Imports** |
| imports.* (all 4) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Approvals** |
| approvals.* (all 2) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Documents** |
| documents.view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| documents.upload | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| documents.update | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| documents.delete | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| documents.manage_categories | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **System** |
| system.* (all 5) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 5. Gaps & Recommendations

### Current Gaps

| Gap | Impact | Priority | Recommendation |
|-----|--------|----------|----------------|
| No role assignment UI | Admins can't assign roles via UI | High | Create `/settings/user-roles` page |
| No role assignment rules | Any resident can be any role | Medium | Add configurable resident-type restrictions |
| No verification workflow | Unverified residents get access | Medium | Implement verification status check |
| Maintenance mode limited | Only blocks routes, not API | Low | Add API-level maintenance check |

### Future Permission Candidates

| Module | Potential Permission | Use Case |
|--------|---------------------|----------|
| Notifications | `notifications.manage_templates` | Template editing |
| Notifications | `notifications.send_manual` | Ad-hoc notifications |
| Maintenance | `maintenance.view` | View maintenance requests |
| Maintenance | `maintenance.manage` | Manage maintenance |

---

## 6. Implementation Files

| Component | Location |
|-----------|----------|
| Permission Constants | `src/lib/auth/action-roles.ts` |
| Authorization Function | `src/lib/auth/authorize.ts` |
| Middleware Protection | `src/middleware.ts` |
| Role Actions | `src/actions/roles/index.ts` |
| Database Schema | `supabase/migrations/20251222000000_create_rbac_system.sql` |
| Type Definitions | `src/types/database.ts` |

---

## 7. Security Considerations

### Implemented
- [x] Server-side permission checks in all actions
- [x] Middleware route protection
- [x] RLS policies on RBAC tables
- [x] Audit logging for role changes
- [x] Hierarchical role levels

### Recommended Enhancements
- [ ] Permission-based RLS policies (beyond basic auth)
- [ ] Role expiration/time-limited assignments
- [ ] Two-person rule for critical operations
- [ ] Permission delegation capabilities

---

*Audit conducted: 2025-12-30*
*Next review: Upon major feature addition*
