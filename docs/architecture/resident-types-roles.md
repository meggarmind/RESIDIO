# Resident Types, Roles & Business Logic

**Last Updated**: 2025-12-30
**Status**: Active
**Related**: [Database Schema](database-schema.md) | [RBAC Permissions](../security/rbac-permissions-audit.md) | [Access Control](../security/access-control.md)

---

## Overview

Residio uses a **two-dimensional classification system** for residents:
1. **Resident Type** (`primary` | `secondary`) - Defines independence level
2. **Resident Role** (8 options) - Defines relationship to property

Additionally, users have **App Roles** that control their administrative access to the system.

---

## 1. Resident Types

| Type | Description | Can Be Corporate? | Independence |
|------|-------------|-------------------|--------------|
| **`primary`** | Relationship holders who can exist independently | Yes | Self-sufficient |
| **`secondary`** | Must be attached to a primary resident | No (individuals only) | Dependent |

### Type Definitions

```typescript
// src/types/database.ts
export type ResidentType = 'primary' | 'secondary';
export type EntityType = 'individual' | 'corporate';
```

### Business Rules

| Rule | Enforcement |
|------|-------------|
| Secondary residents must be individuals | Validation in `resident.ts` |
| Secondary residents require a primary sponsor (for some roles) | `sponsor_resident_id` field |
| Corporate entities can only be primary | Zod schema validation |

---

## 2. Resident Roles

### 2.1 Primary Roles (4 roles)

Relationship holders who can exist independently.

| Role | Code | Description | Entity Types | Billable | Residency |
|------|------|-------------|--------------|----------|-----------|
| **Resident Landlord** | `resident_landlord` | Owner who lives in the unit | Individual | Yes | Yes |
| **Non-Resident Landlord** | `non_resident_landlord` | Owner who doesn't reside there | Individual, Corporate | Yes | No |
| **Tenant** | `tenant` | Leaseholder living in unit | Individual | Yes | Yes |
| **Developer** | `developer` | Holds unsold inventory | Individual, Corporate | Yes | No |

### 2.2 Secondary Roles (4 roles)

Dependents or staff attached to primary residents.

| Role | Code | Description | Sponsor Required | Residency |
|------|------|-------------|------------------|-----------|
| **Co-Resident** | `co_resident` | Adult living in unit (not on title/lease) | No | Yes |
| **Household Member** | `household_member` | Family dependents (spouse, children) | No | No |
| **Domestic Staff** | `domestic_staff` | Employees working/living at unit | Yes | No |
| **Caretaker** | `caretaker` | Maintains a vacant unit | Yes | No |

### Type Definitions

```typescript
// src/types/database.ts
export type ResidentRole =
  | 'resident_landlord'
  | 'non_resident_landlord'
  | 'tenant'
  | 'developer'
  | 'co_resident'
  | 'household_member'
  | 'domestic_staff'
  | 'caretaker';

export type PrimaryResidentRole = 'resident_landlord' | 'non_resident_landlord' | 'tenant' | 'developer';
export type SecondaryResidentRole = 'co_resident' | 'household_member' | 'domestic_staff' | 'caretaker';
export type CorporateRole = 'non_resident_landlord' | 'developer';
export type ResidencyRole = 'resident_landlord' | 'tenant' | 'co_resident';
```

### UI Labels

```typescript
// src/types/database.ts
export const RESIDENT_ROLE_LABELS: Record<ResidentRole, string> = {
  resident_landlord: 'Resident Landlord',
  non_resident_landlord: 'Non-Resident Landlord',
  tenant: 'Tenant',
  developer: 'Developer',
  co_resident: 'Co-Resident',
  household_member: 'Household Member',
  domestic_staff: 'Domestic Staff',
  caretaker: 'Caretaker',
};
```

---

## 3. App Roles (Administrative Access)

App roles control access to the administrative dashboard and features.

| Role | Code | Level | Category | Permissions | System Role |
|------|------|-------|----------|-------------|-------------|
| **Super Administrator** | `super_admin` | 0 | exco | ALL (47) | Yes |
| **Chairman** | `chairman` | 1 | exco | 42 (all except system.*) | No |
| **Vice Chairman** | `vice_chairman` | 2 | exco | 42 (all except system.*) | No |
| **Financial Officer** | `financial_officer` | 3 | exco | 25 (finance-focused) | No |
| **Security Officer** | `security_officer` | 3 | exco | 14 (security-focused) | No |
| **Secretary** | `secretary` | 3 | exco | 18 (admin-focused) | No |
| **Project Manager** | `project_manager` | 3 | exco | 12 (project-focused) | No |
| **Resident** | `resident` | 10 | resident | 0 (portal only) | Yes |

### Type Definitions

```typescript
// src/types/database.ts
export type AppRoleName =
  | 'super_admin'
  | 'chairman'
  | 'vice_chairman'
  | 'financial_officer'
  | 'security_officer'
  | 'secretary'
  | 'project_manager'
  | 'resident';

export type RoleCategory = 'exco' | 'bot' | 'staff' | 'resident';
```

### User Classification

Users can be classified into three types based on their profile fields:

| Type | Condition | Access |
|------|-----------|--------|
| **Pure Admin** | `role_id != null AND resident_id == null` | Admin dashboard only |
| **Pure Resident** | `role_id == null AND resident_id != null` | Resident portal only |
| **Hybrid** | `role_id != null AND resident_id != null` | Both admin & portal |

---

## 4. Business Logic Rules

### 4.1 Corporate Entity Restrictions

```
Corporate entities:
  - CAN ONLY have roles: non_resident_landlord, developer
  - MUST be type: primary
  - MUST provide: company_name, RC number, liaison contact
  - CANNOT be secondary residents
```

**Implementation**: `src/lib/validators/resident.ts`

### 4.2 Billing Priority Logic

When generating invoices for a property, billing follows this priority:

```
1. If tenant exists          → Bill tenant
2. Else if resident_landlord → Bill resident_landlord
3. Else if non_resident_landlord → Bill non_resident_landlord
4. Else if developer         → Bill developer

Secondary roles (co_resident, household_member, etc.) → NOT billable
```

**Implementation**: `src/actions/billing/generate-invoices.ts`

### 4.3 "One Home" Residency Policy

Only these roles indicate actual physical residency in a unit:

| Role | Counts as Resident |
|------|-------------------|
| `resident_landlord` | Yes |
| `tenant` | Yes |
| `co_resident` | Yes |
| All others | No |

**Type Definition**:
```typescript
export type ResidencyRole = 'resident_landlord' | 'tenant' | 'co_resident';
```

### 4.4 Sponsor Requirements

| Role | Requires Sponsor |
|------|-----------------|
| `domestic_staff` | Yes |
| `caretaker` | Yes |
| All others | No |

**Implementation**: `sponsor_resident_id` field in `resident_houses` table

### 4.5 Verification Requirements

To assign the `resident` app role to a user:
```
User's linked resident MUST have verification_status = 'verified'
```

**Implementation**: `src/actions/roles/index.ts` (lines 433-451)

### 4.6 Role Assignment Rules

The `role_assignment_rules` table controls which resident roles can receive which app roles:

| Resident Role | Restrictions |
|---------------|--------------|
| `domestic_staff` | Cannot be assigned exco roles |
| `caretaker` | Cannot be assigned exco roles |
| `household_member` | Limited app role assignments |

**Implementation**: `src/actions/roles/assignment-rules.ts`

---

## 5. Status Enums

### Verification Status

```typescript
export type VerificationStatus = 'pending' | 'submitted' | 'verified' | 'rejected';
```

| Status | Description |
|--------|-------------|
| `pending` | Initial state, awaiting document submission |
| `submitted` | Documents submitted, awaiting review |
| `verified` | Identity verified, can be assigned resident app role |
| `rejected` | Verification failed, reason provided |

### Account Status

```typescript
export type AccountStatus = 'active' | 'inactive' | 'suspended' | 'archived';
```

| Status | Description |
|--------|-------------|
| `active` | Normal operating state |
| `inactive` | Temporarily deactivated |
| `suspended` | Access suspended (e.g., payment issues) |
| `archived` | Soft-deleted, no longer active |

---

## 6. Database Tables

| Table | Purpose |
|-------|---------|
| `residents` | People/entities with `resident_type`, `entity_type`, `account_status`, `verification_status` |
| `resident_houses` | Property assignments with `resident_id`, `house_id`, `resident_role`, `sponsor_resident_id` |
| `profiles` | User accounts with `role` (legacy), `role_id` (new RBAC), `resident_id` |
| `app_roles` | New RBAC roles with `name`, `category`, `level`, `is_system_role` |
| `app_permissions` | Granular permissions with `name`, `category`, `is_active` |
| `role_permissions` | Role-permission junction table |
| `role_assignment_rules` | Resident-role to app-role restrictions |

---

## 7. Implementation Files

| File | Purpose |
|------|---------|
| `src/types/database.ts` | All type definitions and labels |
| `src/lib/validators/resident.ts` | Zod validation schemas and business rules |
| `src/lib/auth/action-roles.ts` | Permission constants and legacy role config |
| `src/lib/auth/authorize.ts` | Authorization functions |
| `src/actions/roles/index.ts` | Role CRUD operations |
| `src/actions/roles/assignment-rules.ts` | Role assignment restrictions |
| `src/actions/residents/verify-resident.ts` | Verification workflow |
| `src/actions/billing/generate-invoices.ts` | Billing priority logic |

---

## 8. Helper Functions

### Type Guards

```typescript
// src/lib/validators/resident.ts

export function isPrimaryRole(role: ResidentRole): role is PrimaryResidentRole {
  return ['resident_landlord', 'non_resident_landlord', 'tenant', 'developer'].includes(role);
}

export function isSecondaryRole(role: ResidentRole): role is SecondaryResidentRole {
  return ['co_resident', 'household_member', 'domestic_staff', 'caretaker'].includes(role);
}

export function requiresSponsor(role: ResidentRole): boolean {
  return ['domestic_staff', 'caretaker'].includes(role);
}

export function isResidencyRole(role: ResidentRole): boolean {
  return ['resident_landlord', 'tenant', 'co_resident'].includes(role);
}

export function isCorporateAllowedRole(role: ResidentRole): boolean {
  return ['non_resident_landlord', 'developer'].includes(role);
}
```

---

## 9. Changelog

| Date | Change | Phase |
|------|--------|-------|
| 2025-12-30 | Initial documentation created | Phase 15 |
| 2025-12-22 | RBAC system implemented with 47 permissions | Phase 10 |
| 2025-11-XX | Resident roles renamed (owner_occupier → resident_landlord, etc.) | Phase 2 |
| 2025-11-XX | Entity types added (individual/corporate) | Phase 3 |

---

*This document should be updated whenever resident types, roles, or business logic changes are implemented.*
