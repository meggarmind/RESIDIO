# Resident Types, Roles & Business Logic

**Last Updated**: 2025-12-31
**Status**: Active
**Related**: [Database Schema](database-schema.md) | [RBAC Permissions](../security/rbac-permissions-audit.md) | [Access Control](../security/access-control.md)

---

## Overview

Residio uses a **two-dimensional classification system** for residents:

1. **Resident Type** (`primary` | `secondary`) - Defines independence level
2. **Resident Role** (9 options) - Defines relationship to property

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

| Role | Display Name | Code | Description | Entity Types | Billable | Residency | Multi-House |
|------|--------------|------|-------------|--------------|----------|-----------|-------------|
| **Owner-Occupier** | Resident Landlord | `resident_landlord` | Owner who lives in the unit | Individual | Yes | Yes | No |
| **Property Owner** | Non-Resident Landlord | `non_resident_landlord` | Owner who doesn't reside there | Individual, Corporate | Yes | No | Yes |
| **Renter** | Tenant | `tenant` | Leaseholder living in unit | Individual | Yes | Yes | No |
| **Developer** | Developer | `developer` | Holds unsold inventory | Individual, Corporate | Yes | No | Yes |

### 2.2 Secondary Roles (5 roles)

Dependents or staff attached to primary residents.

| Role | Display Name | Code | Description | Sponsor Required | Residency | Multi-House |
|------|--------------|------|-------------|------------------|-----------|-------------|
| **Occupant** | Co-Resident | `co_resident` | Adult living in unit (not on title/lease) | No | Yes | No |
| **Family Member** | Household Member | `household_member` | Family dependents (spouse, children) | No | No | No |
| **Domestic Staff** | Domestic Staff | `domestic_staff` | Employees working/living at unit | Yes | No | Yes |
| **Caretaker** | Caretaker | `caretaker` | Maintains a vacant unit | Yes | No | Yes |
| **Contractor** | Contractor | `contractor` | External service providers (plumbers, electricians, etc.) | Yes | No | Yes |

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
  | 'caretaker'
  | 'contractor';

export type PrimaryResidentRole = 'resident_landlord' | 'non_resident_landlord' | 'tenant' | 'developer';
export type SecondaryResidentRole = 'co_resident' | 'household_member' | 'domestic_staff' | 'caretaker' | 'contractor';
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
  contractor: 'Contractor',
};
```

---

## 3. Portal Permissions Matrix

Portal features are access-controlled based on resident role categories.

### 3.1 Role Categories

| Category | Roles | Description |
|----------|-------|-------------|
| **owner** | `resident_landlord`, `non_resident_landlord`, `developer` | Property owners/developers |
| **tenant** | `tenant` | Leaseholders |
| **resident** | `co_resident`, `household_member` | Occupants without billing responsibility |
| **staff** | `domestic_staff`, `caretaker` | Property staff |
| **contractor** | `contractor` | External service providers |

### 3.2 Feature Access by Category

| Feature | Owner | Tenant | Resident | Staff | Contractor |
|---------|-------|--------|----------|-------|------------|
| View Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| View Properties | ✅ | ✅ | ✅ | ✅ | ❌ |
| View Invoices | ✅ | ✅ | ✅ | ❌ | ❌ |
| Pay Invoices | ✅ | ✅ | ❌ | ❌ | ❌ |
| View Wallet | ✅ | ✅ | ❌ | ❌ | ❌ |
| View Security Contacts | ✅ | ✅ | ✅ | ❌ | ❌ |
| Manage Security Contacts | ✅ | ✅ | ❌ | ❌ | ❌ |
| View Documents | ✅ | ✅ | ✅ | ❌ | ❌ |
| View Profile | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit Profile | ✅ | ✅ | ✅ | ✅ | ✅ |
| View Announcements | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-Property Dashboard | ✅ | ❌ | ❌ | ❌ | ❌ |
| Property Transition | ✅ | ❌ | ❌ | ❌ | ❌ |
| View Occupants | ✅ | ✅ | ✅ | ❌ | ❌ |
| Manage Occupants | ✅ | ✅ | ❌ | ❌ | ❌ |

### 3.3 Conditional Access

| Role | Condition | Access |
|------|-----------|--------|
| **Developer** | Property has active tenant | Limited to property info, no resident management |
| **Property Owner** | Property has active tenant | Limited to property info, no security contact changes |

**Implementation**: `src/lib/portal/permissions.ts`

---

## 4. Adding Residents Rules

### 4.1 Who Can Add Which Roles

| Adding Role | Can Add | Cannot Add |
|-------------|---------|------------|
| **Owner-Occupier** | Occupant, Family Member, Domestic Staff | Caretaker, Contractor |
| **Renter** | Occupant, Family Member, Domestic Staff | Caretaker, Contractor |
| **Property Owner** | Caretaker, Contractor | Occupant, Family Member, Domestic Staff |
| **Developer** | Caretaker, Contractor | Occupant, Family Member, Domestic Staff |
| **Occupant** | ❌ None | All |
| **Family Member** | ❌ None | All |
| **Domestic Staff** | ❌ None | All |
| **Caretaker** | ❌ None | All |
| **Contractor** | ❌ None | All |

### 4.2 Approval Requirements

| Source | Approval Required | Auto-Approved |
|--------|-------------------|---------------|
| Portal-initiated additions | Yes (admin approval required) | ❌ |
| Admin dashboard additions | No | ✅ |

**Implementation**: `src/actions/residents/add-household-member.ts`

---

## 5. Visibility Rules

### 5.1 Resident Visibility by Role

| Viewing Role | Can See Primary | Can See Secondary | Cross-House View |
|--------------|----------------|-------------------|------------------|
| **Owner-Occupier** | ✅ | ✅ | ❌ |
| **Renter** | ✅ | ✅ (own household only) | ❌ |
| **Occupant** | ✅ | ✅ (own household only) | ❌ |
| **Property Owner** | ✅ (primary only) | ❌ (privacy) | ❌ |
| **Developer** | ✅ (primary only) | ❌ (privacy) | ❌ |

### 5.2 Privacy Rules

| Rule | Description |
|------|-------------|
| **Tenant Privacy** | Property Owners cannot see Renter's Family Members or secondary residents |
| **Owner Privacy** | Renters cannot see Property Owner's Domestic Staff assigned to vacant period |
| **Cross-Property** | No role can see residents on other houses they're not attached to |

**Implementation**: Row-Level Security (RLS) policies in `supabase/migrations/`

---

## 6. Security Contact Management

### 6.1 Management Rights by Property State

| Property State | Who Manages Security Contacts |
|----------------|-------------------------------|
| **Occupied (with Renter)** | Renter, Occupant |
| **Occupied (Owner-Occupier)** | Owner-Occupier, Occupant |
| **Vacant** | Property Owner, Developer |
| **Under Development** | Developer, Caretaker, Contractor |

### 6.2 Approval Required for Non-Occupying Owners

When a property is occupied by a tenant:

- Property Owner/Developer actions on security contacts require **tenant approval**
- Actions requiring approval:
  - Adding security contacts
  - Removing security contacts
  - Generating access codes

**Implementation**: `src/actions/approvals/`

### 6.3 Enhanced Visitor Management

The system supports advanced visitor features including:

- **Recurring Visitors**: Scheduled access patterns (daily, weekly, etc.)
- **Vehicle Registration**: License plate tracking and photo capture
- **Visit Analytics**: Duration tracking and frequency analysis

See [Visitor Management Enhancements](../features/visitor-management.md) for full details.

---

## 7. Approval Workflows

### 7.1 Developer/Property Owner Actions Requiring Approval

When property is occupied, these actions by Developer or Property Owner require approval from the occupying resident (Owner-Occupier or Renter):

| Action | Approval Required From | Timeout |
|--------|----------------------|---------|
| Add Caretaker | Occupier/Renter | 72 hours |
| Add Contractor | Occupier/Renter | 72 hours |
| Add Security Contact | Occupier/Renter | 72 hours |
| Generate Access Code | Occupier/Renter | 72 hours |

### 7.2 Approval Flow

```
1. Request submitted by Developer/Property Owner
     ↓
2. Notification sent to Occupier/Renter (in-app + email)
     ↓
3. 72-hour approval window
     ↓
4a. Approved → Action executed
4b. Rejected → Action cancelled with reason
4c. No response → Auto-reject after timeout
     ↓
5. Audit trail recorded
```

### 7.3 Hierarchical Settings for Approvals

Approval requirements can be configured at three levels:

1. **Estate-wide default**: Applied to all properties
2. **Per-property override**: Specific to individual properties
3. **Per-resident override**: Specific to individual residents

Lower levels override higher levels.

**Implementation**: `src/actions/approvals/`, `src/app/(dashboard)/approvals/`

---

## 8. Domestic Staff Distinctions

### 8.1 Live-in vs Visiting Staff

| Attribute | Live-in Staff | Visiting Staff |
|-----------|--------------|----------------|
| **`is_live_in`** | `true` | `false` |
| **Portal Access** | Full portal access | No portal access |
| **Occupancy Count** | May count (configurable) | Never counts |
| **Access Codes** | Time-limited, auto-renewing | Time-limited (default: fortnightly) |

### 8.2 Access Code Renewal Flow

```
1. Visiting staff assigned with access code validity (default: 14 days)
     ↓
2. Notification sent 24 hours before expiry
     ↓
3. Resident can:
   a. Renew → New access code issued
   b. Convert to live-in → Full access granted
   c. Deactivate → Access revoked
     ↓
4. If no action → Access expires automatically
```

### 8.3 Database Fields

```typescript
// resident_houses table
{
  is_live_in: boolean;          // true = lives at property, false = visiting
  tags: string[];               // Additional attributes like 'has-gate-access'
}
```

**Implementation**: `src/actions/residents/`, `resident_houses.is_live_in` column

---

## 9. Sponsor Cascade Rules

### 9.1 When Sponsor Leaves

When a primary resident (sponsor) leaves a property, their sponsored residents are affected:

| Sponsored Role | Requires Sponsor | Default Action |
|----------------|-----------------|----------------|
| **Domestic Staff** | Yes | Remove from property |
| **Caretaker** | Yes | Remove from property |
| **Contractor** | Yes | Remove from property |
| **Co-Resident** | No | Keep without sponsor |
| **Household Member** | No | Keep without sponsor |

### 9.2 Cascade Options

| Action | Description | Applicable Roles |
|--------|-------------|------------------|
| **Remove** | Remove from property | All sponsored roles |
| **Transfer** | Transfer to new sponsor | All sponsored roles |
| **Keep Unsupported** | Keep without sponsor | `co_resident`, `household_member` only |

### 9.3 Promotion System

When a sponsor departs, sponsored residents who need to replace the departing sponsor can be:

1. **Transferred** to another primary resident at the property
2. **Promoted** to primary status (if eligible)
3. **Removed** from the property

### 9.4 Domestic Staff Inheritance

When a Renter joins a property with existing Property Owner domestic staff:

```
1. Property Owner has domestic staff (e.g., security guard)
     ↓
2. Renter moves in
     ↓
3. System checks: Should staff transfer to new occupier?
     ↓
4a. If yes → Staff sponsored by Renter
4b. If no → Staff remains with Property Owner (limited access during tenancy)
```

**Implementation**: `src/actions/residents/sponsor-cascade.ts`, `src/actions/residents/inherit-domestic-staff.ts`

---

## 10. Settings Hierarchy

### 10.1 Three-Level Configuration

Settings can be configured at three levels, with lower levels overriding higher:

```
┌─────────────────────────────────────────┐
│           Estate-Wide Settings          │  ← Default for all
├─────────────────────────────────────────┤
│          Per-Property Settings          │  ← Override for specific house
├─────────────────────────────────────────┤
│          Per-Resident Settings          │  ← Override for specific person
└─────────────────────────────────────────┘
```

### 10.2 Configurable Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `live_in_staff_counts_occupancy` | Whether live-in domestic staff count toward occupancy limits | `false` |
| `family_members_in_occupancy_reports` | Whether Family Members appear in occupancy reports | `true` |
| `default_access_code_validity` | Default validity period for access codes | 14 days |
| `developer_approval_timeout` | Timeout for Developer action approvals | 72 hours |

### 10.3 Override Logic

```typescript
function getEffectiveSetting(setting: string, residentId: string, houseId: string) {
  // 1. Check per-resident override
  const residentSetting = getResidentSetting(residentId, setting);
  if (residentSetting !== null) return residentSetting;

  // 2. Check per-house override
  const houseSetting = getHouseSetting(houseId, setting);
  if (houseSetting !== null) return houseSetting;

  // 3. Fall back to estate-wide default
  return getEstateSetting(setting);
}
```

**Implementation**: `src/actions/settings/`

---

## 11. Tags/Attributes System

### 11.1 Available Tags

Tags can be assigned per resident-house relationship to control access and features:

| Tag | Description | Default |
|-----|-------------|---------|
| `has-gate-access` | Resident can use main gate access | Primary roles: Yes |
| `receives-invoices` | Resident receives invoice notifications | Billable roles: Yes |
| `receives-notices` | Resident receives estate notices | All: Yes |
| `live-in` | Staff member lives at property | `is_live_in` field |
| `visiting` | Staff member is visiting only | `!is_live_in` |
| `can-add-visitors` | Resident can add security contacts | Primary + Occupant: Yes |
| `requires-renewal` | Access requires periodic renewal | Visiting staff: Yes |

### 11.2 Tag Storage

```typescript
// resident_houses table
{
  tags: string[];  // Array of tag strings, e.g., ['has-gate-access', 'receives-invoices']
}
```

### 11.3 Tag Override Hierarchy

Tags can be configured at:

1. **Role defaults**: Default tags for each role
2. **Per-house assignment**: Override for specific house assignment
3. **Manual override**: Admin can manually add/remove tags

---

## 12. App Roles (Administrative Access)

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

### User Classification

Users can be classified into three types based on their profile fields:

| Type | Condition | Access |
|------|-----------|--------|
| **Pure Admin** | `role_id != null AND resident_id == null` | Admin dashboard only |
| **Pure Resident** | `role_id == null AND resident_id != null` | Resident portal only |
| **Hybrid** | `role_id != null AND resident_id != null` | Both admin & portal |

---

## 13. Business Logic Rules

### 13.1 Corporate Entity Restrictions

```
Corporate entities:
  - CAN ONLY have roles: non_resident_landlord, developer
  - MUST be type: primary
  - MUST provide: company_name, RC number, liaison contact
  - CANNOT be secondary residents
```

**Implementation**: `src/lib/validators/resident.ts`

### 13.2 Billing Priority Logic

When generating invoices for a property, billing follows this priority:

```
1. If tenant exists          → Bill tenant
2. Else if resident_landlord → Bill resident_landlord
3. Else if non_resident_landlord → Bill non_resident_landlord
4. Else if developer         → Bill developer

Secondary roles (co_resident, household_member, etc.) → NOT billable
```

**Implementation**: `src/actions/billing/generate-invoices.ts`

### 13.3 "One Home" Residency Policy

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

### 13.4 Sponsor Requirements

| Role | Requires Sponsor | Valid Sponsors |
|------|-----------------|----------------|
| `domestic_staff` | Yes | Any primary resident at house |
| `caretaker` | Yes | Property Owner, Developer |
| `contractor` | Yes | Property Owner, Developer |
| All others | No | N/A |

**Implementation**: `sponsor_resident_id` field in `resident_houses` table

### 13.5 Verification Requirements

To assign the `resident` app role to a user:

```
User's linked resident MUST have:
- email_verified_at IS NOT NULL (if email exists)
- phone_verified_at IS NOT NULL (for phone)
```

**Implementation**: `src/actions/verification/verify-contact.ts`

### 13.6 Role Assignment Rules

The `role_assignment_rules` table controls which resident roles can receive which app roles:

| Resident Role | Restrictions |
|---------------|--------------|
| `domestic_staff` | Cannot be assigned exco roles |
| `caretaker` | Cannot be assigned exco roles |
| `household_member` | Limited app role assignments |
| `contractor` | Cannot be assigned exco roles |

**Implementation**: `src/actions/roles/assignment-rules.ts`

---

## 14. Status Enums

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

## 15. Database Tables

| Table | Purpose |
|-------|---------|
| `residents` | People/entities with `resident_type`, `entity_type`, `account_status`, `verification_status` |
| `resident_houses` | Property assignments with `resident_id`, `house_id`, `resident_role`, `sponsor_resident_id`, `is_live_in`, `tags` |
| `profiles` | User accounts with `role` (legacy), `role_id` (new RBAC), `resident_id` |
| `app_roles` | New RBAC roles with `name`, `category`, `level`, `is_system_role` |
| `app_permissions` | Granular permissions with `name`, `category`, `is_active` |
| `role_permissions` | Role-permission junction table |
| `role_assignment_rules` | Resident-role to app-role restrictions |
| `house_ownership_history` | Historical record of property transitions |

---

## 16. Implementation Files

| File | Purpose |
|------|---------|
| `src/types/database.ts` | All type definitions and labels |
| `src/lib/validators/resident.ts` | Zod validation schemas and business rules |
| `src/lib/portal/permissions.ts` | Portal feature access control |
| `src/lib/auth/action-roles.ts` | Permission constants and legacy role config |
| `src/lib/auth/authorize.ts` | Authorization functions |
| `src/actions/roles/index.ts` | Role CRUD operations |
| `src/actions/roles/assignment-rules.ts` | Role assignment restrictions |
| `src/actions/residents/verify-resident.ts` | Verification workflow |
| `src/actions/residents/sponsor-cascade.ts` | Sponsor departure handling |
| `src/actions/residents/inherit-domestic-staff.ts` | Staff inheritance on occupier change |
| `src/actions/houses/property-transition.ts` | Property sale/lease workflows |
| `src/actions/billing/generate-invoices.ts` | Billing priority logic |
| `src/actions/approvals/` | Approval workflow actions |

---

## 17. Helper Functions

### Type Guards

```typescript
// src/lib/validators/resident.ts

export function isPrimaryRole(role: ResidentRole): role is PrimaryResidentRole {
  return ['resident_landlord', 'non_resident_landlord', 'tenant', 'developer'].includes(role);
}

export function isSecondaryRole(role: ResidentRole): role is SecondaryResidentRole {
  return ['co_resident', 'household_member', 'domestic_staff', 'caretaker', 'contractor'].includes(role);
}

export function requiresSponsor(role: ResidentRole): boolean {
  return ['domestic_staff', 'caretaker', 'contractor'].includes(role);
}

export function isResidencyRole(role: ResidentRole): boolean {
  return ['resident_landlord', 'tenant', 'co_resident'].includes(role);
}

export function isCorporateAllowedRole(role: ResidentRole): boolean {
  return ['non_resident_landlord', 'developer'].includes(role);
}
```

### Portal Permissions

```typescript
// src/lib/portal/permissions.ts

export function getRoleCategory(role: ResidentRole): RoleCategory;
export function hasPortalFeatureAccess(role: ResidentRole, feature: PortalFeature): boolean;
export function getPortalFeaturesForRole(role: ResidentRole): PortalFeature[];
export function getHighestPrivilegeRole(roles: ResidentRole[]): ResidentRole | null;
```

---

## 18. Changelog

| Date | Change | Phase |
|------|--------|-------|
| 2025-12-31 | Comprehensive documentation update: Added Contractor role, portal permissions matrix, visibility rules, security contact management, approval workflows, domestic staff distinctions, sponsor cascade rules, settings hierarchy, and tags system | Phase 15 |
| 2025-12-30 | Initial documentation created | Phase 15 |
| 2025-12-22 | RBAC system implemented with 47 permissions | Phase 10 |
| 2025-11-XX | Resident roles renamed (owner_occupier → resident_landlord, etc.) | Phase 2 |
| 2025-11-XX | Entity types added (individual/corporate) | Phase 3 |

---

*This document should be updated whenever resident types, roles, or business logic changes are implemented.*
