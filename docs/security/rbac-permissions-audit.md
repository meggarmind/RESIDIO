# RBAC Permissions Audit

**Date**: 2025-12-30
**Phase**: Core Infrastructure
**Status**: Complete

---

## Executive Summary

Residio uses a modern, flexible RBAC system (implemented in Phase 10) with:
- **47 granular permissions** across 11 functional categories
- **8 system roles** with hierarchical levels
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

| Level | Role | Category | System Role | Permissions |
|-------|------|----------|-------------|-------------|
| 0 | `super_admin` | exco | Yes | ALL (47) |
| 1 | `chairman` | exco | No | ALL except system.* (42) |
| 2 | `vice_chairman` | exco | No | ALL except system.* (42) |
| 3 | `financial_officer` | exco | No | Finance-focused (25) |
| 3 | `security_officer` | exco | No | Security-focused (14) |
| 3 | `secretary` | exco | No | Admin-focused (18) |
| 3 | `project_manager` | exco | No | Project-focused (12) |
| 10 | `resident` | resident | Yes | None (portal only) |

---

## 4. Role-Permission Matrix

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
