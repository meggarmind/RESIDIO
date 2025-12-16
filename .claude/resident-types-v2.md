# SmartRes Resident Types & Relationships v2

## Overview

The resident management system uses a multi-dimensional classification:

1. **Person Category** — Resident vs Non-Resident individuals
2. **Resident Type** — Household hierarchy (primary/secondary)
3. **Resident Role** — Property relationship (owner/co_owner/developer/tenant/occupier/domestic_staff/proxy)
4. **Verification Status** — KYC completion state
5. **Account Status** — Active, suspended, blacklisted

Non-residents (estate workers, contractors) are tracked separately for access control and documentation.

---

## Person Categories

| Category | Description | Tracked In | Portal Access | WhatsApp Bot |
|----------|-------------|------------|---------------|--------------|
| **Resident** | Lives in/owns property on estate | `residents` + `resident_houses` | ✅ If verified | ✅ If verified |
| **Estate Worker** | Employed by estate management | `estate_personnel` | ❌ No | ❌ No |
| **Contractor** | Temporary worker for construction | `contractors` | ⚠️ Limited | ⚠️ Visitor invites only |

---

## Resident Types (Household Hierarchy)

| Type | Description | Capabilities |
|------|-------------|--------------|
| **Primary** | Main account holder for the household | Full portal access, receives all communications, billing authority |
| **Secondary** | Additional household members linked to primary | Configurable access via delegation rights |

### Primary-Secondary Relationship
```
Primary Resident (owner)
├── Secondary Resident (co_owner / spouse)
├── Secondary Resident (occupier / adult child)
├── Secondary Resident (occupier / teenager 13+)
└── Secondary Resident (domestic_staff)
```

---

## Resident Roles (Property Relationship)

Defined in `resident_houses` junction table:

| Role | Description | Billing | Admin | Invite Visitors | Register Vehicles |
|------|-------------|---------|-------|-----------------|-------------------|
| **Owner** | Legal property owner | ✅ Full | ✅ Full | ✅ | ✅ |
| **Co-Owner** | Joint property owner (spouse) | ❌ Shared | ✅ Full | ✅ | ✅ |
| **Developer** | Corporate CEO/MD for undeveloped plots | ✅ Full | ✅ Full | ✅ | ✅ |
| **Tenant** | Renting from owner | ⚠️ Config | ✅ Limited | ✅ | ✅ |
| **Occupier** | Lives in property (family, teenager 13+) | ❌ None | ⚠️ Delegated | ✅ | ✅ |
| **Domestic Staff** | Household employee | ❌ None | ❌ None | ❌ | ❌ |
| **Proxy** | Authorized representative (diaspora/corporate) | ❌ None | ✅ Delegated | ✅ | ✅ |

### Role Details

#### Owner vs Co-Owner
For properties with joint ownership (typically married couples):
- **Owner** is designated as the primary billing contact
- **Co-Owner** has full admin rights but billing flows to Owner
- Debt is tracked against the Owner record
- Both can perform all admin functions equally
- Recommendation: Owner = whoever handles household finances

#### Developer (Corporate Ownership)
- Represents CEO/MD of corporate entity owning plots
- Company representatives recorded as **Contractors** (see below)
- **Auto-suspension**: When owner/tenant assigned as primary on associated property:
  - Developer's access to that property is suspended
  - If ALL associated properties transferred → full access suspended
  - Developer still receives estate news/alerts (read-only)
- Link to `corporate_entities` table for company details

#### Proxy
- Authorized representative for absentee owners (diaspora) or corporate entities
- Must be explicitly delegated by Owner/Developer
- Can perform admin functions on behalf of principal
- Cannot assume billing responsibility
- Access revoked when principal's ownership ends

#### Domestic Staff
- Linked to house for documentation and gate access only
- Cannot: view financials, log payments, manage residence, register vehicles, invite visitors
- Can: receive visitor arrival notifications (if configured)
- Requires sponsor (owner/tenant)
- Profile retained when deactivated; can be reactivated and transferred to new owner/house

---

## Non-Resident Categories

### Estate Workers
Personnel employed by estate management.

| Attribute | Description |
|-----------|-------------|
| **Examples** | Street sweepers, security guards, gardeners, admin staff |
| **Employer** | Estate management company |
| **Property Link** | None (estate-wide access) |
| **Tracked For** | Access control, ID badges, payroll reference |
| **System Access** | ❌ No portal/WhatsApp access |

### Contractors
Temporary workers for construction/renovation — includes corporate representatives.

| Attribute | Description |
|-----------|-------------|
| **Examples** | Builders, electricians, plumbers, company reps |
| **Sponsor** | Developer or Owner commissioning the work |
| **Property Link** | Specific house/plot under construction |
| **Duration** | Time-bound (`valid_from`, `valid_until`) |
| **Key Capability** | Can invite visitors (deliveries, artisans, specialists) |
| **Auto-suspension** | Access suspended when owner/tenant assigned to property |
| **System Access** | ⚠️ Limited — visitor invitation only |

---

## Verification & Access Control

### Verification Status (`verification_status`)

| Status | Description | System Access |
|--------|-------------|---------------|
| **Pending** | Resident form not submitted | ❌ No access |
| **Submitted** | Form submitted, awaiting admin review | ❌ No access |
| **Verified** | Admin approved, KYC complete | ✅ Full access per role |
| **Rejected** | Form rejected (resubmission required) | ❌ No access |

### Account Status (`account_status`)

| Status | Description | System Access |
|--------|-------------|---------------|
| **Active** | Normal operating state | ✅ Per role |
| **Suspended** | Temporarily restricted (rule violation, dispute) | ❌ No access |
| **Blacklisted** | Permanently banned | ❌ No access |
| **Inactive** | Voluntarily deactivated or moved out | ❌ No access |

### Restriction Flags
Stored in `resident_restrictions` table:
- `restriction_type`: suspended, blacklisted, debt_hold, legal_hold
- `reason`: Free text description
- `imposed_by`: Admin who applied restriction
- `imposed_at`: Timestamp
- `expires_at`: NULL for permanent, date for temporary
- `lifted_by`, `lifted_at`: When/who removed restriction

---

## Unique Identifiers

### Resident UUID
Every resident receives a **unique 6-digit alphanumeric code** upon registration:
- Format: `[A-Z0-9]{6}` (e.g., `A3F7K2`)
- Purpose: Maps to physical RFID access cards
- Persists for life of record (even if deactivated)
- Displayed on resident profile and ID cards

```
residents.resident_uuid VARCHAR(6) UNIQUE NOT NULL
```

---

## Vehicles

Vehicles are linked to **residents**, not houses.

| Field | Description |
|-------|-------------|
| `resident_id` | Owner of vehicle (FK to residents) |
| `plate_number` | License plate (unique) |
| `make`, `model`, `color` | Vehicle description |
| `is_primary` | Primary vehicle for gate auto-recognition |
| `is_active` | Can be deactivated without deletion |
| `registered_at` | Timestamp |

### Vehicle Registration Rights by Role

| Role | Can Register Vehicles |
|------|-----------------------|
| Owner | ✅ |
| Co-Owner | ✅ |
| Developer | ✅ |
| Tenant | ✅ |
| Occupier | ✅ |
| Proxy | ✅ |
| Domestic Staff | ❌ |

---

## Access Cards (RFID)

| Field | Description |
|-------|-------------|
| `resident_id` | Cardholder (FK to residents) |
| `card_number` | Physical card ID |
| `resident_uuid` | Mapped 6-digit code |
| `issued_at` | Issue date |
| `expires_at` | Expiry date (optional) |
| `is_active` | Can be deactivated if lost/stolen |
| `deactivated_reason` | Lost, stolen, returned, expired |

---

## Visitors

### Visitor Categories

| Category | Description | Managed By |
|----------|-------------|------------|
| **Ad-hoc Visitor** | One-time guest | Resident invitation |
| **Recurring Visitor** | Regular service provider for specific house | Resident pre-registration |
| **Estate Service Provider** | Serves multiple houses (landscaper, pool cleaner) | Estate admin |
| **Commercial Tenant Visitor** | Visitors to commercial properties (church, etc.) | Commercial resident |
| **Pre-approved Service** | School buses, approved delivery services | Estate admin |
| **Contractor Visitor** | Deliveries/artisans invited by contractors | Contractor invitation |

### Blacklist
`visitor_blacklist` table:
- `name`, `phone`, `id_number` (any available identifier)
- `reason`: Why blacklisted
- `blacklisted_by`: Resident or admin who reported
- `blacklisted_at`: Timestamp
- `scope`: `estate_wide` or `house_specific`
- `house_id`: If house-specific ban

---

## Communication Preferences

Per-resident preferences stored in `resident_preferences`:

| Preference | Options | Default |
|------------|---------|---------|
| `billing_reminders` | true/false | true |
| `estate_news` | true/false | true |
| `visitor_notifications` | true/false | true |
| `contact_method` | whatsapp, sms, email, whatsapp+email, all | whatsapp |

Note: Suspended developers with no active properties still receive `estate_news` if enabled.

---

## Delegation Rights

Owners can delegate specific capabilities to secondary residents via `resident_delegations`:

| Delegation | Description |
|------------|-------------|
| `view_financials` | Can see balances, statements |
| `log_payments` | Can record payments |
| `manage_residence` | Can update house settings |
| `register_visitors` | Can invite visitors |
| `register_vehicles` | Can add/remove vehicles |
| `full_admin` | All of the above |

```
resident_delegations:
- delegator_id (owner granting rights)
- delegate_id (resident receiving rights)
- house_id (scope of delegation)
- delegation_type (from list above)
- granted_at
- revoked_at (NULL if active)
```

---

## Entity Relationships

```
                              RESIDENTS & PROPERTIES
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│    residents    │────<│  resident_houses │>────│   houses    │
│                 │ M:N │                  │ M:N │             │
│ - id            │     │ - resident_id    │     │ - id        │
│ - resident_uuid │     │ - house_id       │     │ - house_no  │
│ - name          │     │ - resident_role  │     │ - house_code│
│ - phone         │     │ - is_active      │     │ - street_id │
│ - email         │     │ - billing_resp   │     │ - type_id   │
│ - resident_type │     │ - sponsor_id     │     └─────────────┘
│ - verification_ │     │ - delegated_by   │
│   status        │     │ - residency_start│
│ - account_status│     │ - residency_end  │
│ - primary_      │     │ - deactivation_  │
│   resident_id   │     │   reason         │
└────────┬────────┘     └──────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────┐     ┌──────────────────┐
│    vehicles     │     │   access_cards   │
│                 │     │                  │
│ - resident_id   │     │ - resident_id    │
│ - plate_number  │     │ - card_number    │
│ - make/model    │     │ - resident_uuid  │
│ - is_active     │     │ - is_active      │
└─────────────────┘     └──────────────────┘

                        CORPORATE & PROXY
┌──────────────────┐     ┌──────────────────┐
│corporate_entities│     │ resident_proxies │
│                  │     │                  │
│ - id             │     │ - principal_id   │──► residents (owner/dev)
│ - company_name   │     │ - proxy_id       │──► residents (proxy role)
│ - rc_number      │     │ - house_id       │
│ - ceo_resident_id│──►  │ - granted_at     │
│ - is_active      │     │ - revoked_at     │
└──────────────────┘     └──────────────────┘

                           NON-RESIDENTS
┌──────────────────┐     ┌──────────────────┐
│ estate_personnel │     │   contractors    │
│                  │     │                  │
│ - id             │     │ - id             │
│ - name, phone    │     │ - name, phone    │
│ - role           │     │ - company        │
│ - department     │     │ - sponsor_id ────┼──► residents
│ - badge_no       │     │ - house_id       │
│ - is_active      │     │ - valid_from/to  │
│ - hired_date     │     │ - is_active      │
│ - terminated_date│     │ - suspended_at   │
└──────────────────┘     └──────────────────┘

                              VISITORS
┌──────────────────┐     ┌──────────────────┐
│     visitors     │     │ visitor_blacklist│
│                  │     │                  │
│ - id             │     │ - identifier     │
│ - name, phone    │     │ - reason         │
│ - invited_by     │──►  │ - scope          │
│ - invited_by_type│     │ - blacklisted_by │
│   (resident/     │     │ - house_id       │
│    contractor)   │     └──────────────────┘
│ - house_id       │
│ - visitor_type   │     ┌──────────────────┐
│ - is_recurring   │     │estate_service_   │
│ - recurrence_    │     │   providers      │
│   pattern        │     │                  │
│ - valid_from/to  │     │ - id             │
│ - visited_at     │     │ - company_name   │
└──────────────────┘     │ - service_type   │
                         │ - is_preapproved │
                         │ - is_active      │
                         └──────────────────┘

                           AUDIT & HISTORY
┌──────────────────┐     ┌──────────────────┐
│   audit_trail    │     │ payment_archive  │
│                  │     │                  │
│ - id             │     │ - original_id    │
│ - table_name     │     │ - house_id       │
│ - record_id      │     │ - resident_id    │
│ - action (CRUD)  │     │ - amount, date   │
│ - old_values     │     │ - archived_at    │
│ - new_values     │     │ - archived_reason│
│ - changed_by     │     │   (ownership_    │
│ - changed_at     │     │    transfer)     │
│ - ip_address     │     └──────────────────┘
└──────────────────┘
```

---

## Key Scenarios

### 1. Single Owner-Occupier
```
Resident A (primary, owner, verified) ──► House 101
```

### 2. Married Couple (Co-Ownership)
```
Resident A (primary, owner)    ──► House 101 (billing: true)
Resident B (secondary, co_owner)──► House 101 (billing: false, full admin)
```

### 3. Multi-Property Owner
```
Resident A (primary, owner) ──► House 101 (occupied)
                            ──► House 205 (vacant/rental)
```

### 4. Tenant Household
```
Resident B (primary, tenant)   ──► House 101
Resident C (secondary, occupier)──► House 101 (spouse, delegated rights)
Resident D (secondary, occupier)──► House 101 (teenager, limited rights)
```

### 5. Owner with Tenant
```
Resident A (primary, owner)  ──► House 101 (billing: true, suspended access)
Resident B (primary, tenant) ──► House 101 (billing: configurable, active)
```

### 6. Diaspora Owner with Proxy
```
Resident A (primary, owner)  ──► House 101 (overseas, limited activity)
Resident P (secondary, proxy)──► House 101 (delegated full_admin)
```

### 7. Corporate Developer
```
Corporate Entity: ABC Developers Ltd
├── Resident X (primary, developer/CEO) ──► Plot A-15, A-16, B-03
│
└── Contractors (company reps):
    ├── Contractor Y ──► Plot A-15 (can invite visitors)
    └── Contractor Z ──► Plot A-16 (can invite visitors)

When Plot A-15 sold:
├── New Owner M (primary, owner) ──► Plot A-15
├── Contractor Y ──► SUSPENDED for A-15
└── Resident X ──► A-15 access suspended, retains A-16, B-03
```

### 8. Domestic Staff Transfer
```
Before: House 101 sold
├── Resident A (owner, deactivating)
└── Resident E (domestic_staff, deactivated, retained)

After: New owner activates existing staff
├── Resident M (new owner)
└── Resident E (domestic_staff, reactivated, new sponsor)
```

### 9. Commercial Property (Church)
```
Resident C (primary, owner) ──► Plot C-05 (Church building)
├── Can pre-register recurring visitors (congregation)
├── Visitors marked as "commercial_tenant_visitor"
└── Visitor list managed separately from residential
```

### 10. School Bus (Pre-approved Service)
```
Estate Service Provider: ABC School Transport
├── Type: pre_approved
├── Vehicles: Bus-001, Bus-002
├── Schedule: Mon-Fri 7:00-8:00, 14:00-15:00
└── Auto-approved entry during schedule
```

---

## Business Rules

### Residents
1. **Debt follows the individual**, not the property
2. **One primary resident per household**; secondaries link via `primary_resident_id`
3. **Multiple residents per property** supported with distinct roles
4. **Role-based billing**: Owner/Developer mandatory; Tenant configurable; others none
5. **Verification required**: No system access until KYC complete
6. **Unique UUID**: 6-digit code assigned at registration, persists forever

### Co-Ownership
7. **One designated Owner** for billing/debt purposes
8. **Co-Owner has full admin rights** equal to Owner
9. **Both receive communications** unless preferences differ

### Developers & Corporate
10. **Developer = CEO/MD** of corporate entity
11. **Company reps = Contractors** with visitor invitation rights
12. **Auto-suspension** when property transferred to owner/tenant
13. **News access retained** even when fully suspended (read-only)

### Proxies
14. **Explicit delegation required** from Owner/Developer
15. **Scope limited to specific properties**
16. **Revoked when principal's ownership ends**

### Domestic Staff
17. **Sponsor required** (owner/tenant)
18. **No admin capabilities** whatsoever
19. **Retained when deactivated**; transferable to new owner/house
20. **Cannot register vehicles or invite visitors**

### Contractors
21. **Time-bound access** with valid_from/valid_until
22. **Can invite visitors** (deliveries, artisans)
23. **Auto-suspended** when owner/tenant assigned to property

### Ownership Transfer
24. **Debt stays with seller** (individual-centric)
25. **Domestic staff deactivated** but retained
26. **Payment history archived** — not visible to new owner
27. **Admins can view full house history** across owners

### Tenant Offboarding
28. **Deactivation with reason** required
29. **No formal process** but audit trail captures details

### Vehicles & Access
30. **Vehicles linked to residents**, not houses
31. **Domestic staff cannot register vehicles**
32. **Access cards mapped to resident_uuid**

### Visitors
33. **Contractors can invite visitors** for their assigned property
34. **Blacklist supports estate-wide or house-specific** scope
35. **Commercial properties** manage visitor lists separately
36. **Pre-approved services** (school buses) have scheduled auto-entry

### Audit & Retention
37. **Comprehensive audit trail** for all changes
38. **10-year data retention** for all records
39. **Archived records** accessible to admins only

---

## Database Constraints

```sql
-- Resident role validation
CHECK (resident_role IN ('owner', 'co_owner', 'developer', 'tenant', 
                          'occupier', 'domestic_staff', 'proxy'))

-- Resident type validation  
CHECK (resident_type IN ('primary', 'secondary'))

-- Verification status
CHECK (verification_status IN ('pending', 'submitted', 'verified', 'rejected'))

-- Account status
CHECK (account_status IN ('active', 'suspended', 'blacklisted', 'inactive'))

-- Resident UUID format
CHECK (resident_uuid ~ '^[A-Z0-9]{6}$')

-- Domestic staff must have sponsor
-- (enforced via trigger)
-- sponsor_id NOT NULL WHERE resident_role = 'domestic_staff'

-- Proxy must have delegated_by
-- (enforced via trigger)
-- delegated_by NOT NULL WHERE resident_role = 'proxy'

-- Contractor date validation
CHECK (valid_until >= valid_from)

-- Contractor must have sponsor
CHECK (sponsor_id IS NOT NULL)

-- Visitor blacklist scope
CHECK (scope IN ('estate_wide', 'house_specific'))
CHECK ((scope = 'house_specific' AND house_id IS NOT NULL) OR 
       (scope = 'estate_wide' AND house_id IS NULL))
```

---

## Capability Matrix by Role

| Capability | Owner | Co-Owner | Developer | Tenant | Occupier | Proxy | Domestic |
|------------|-------|----------|-----------|--------|----------|-------|----------|
| View Financial Status | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ❌ |
| Log Payment | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ❌ |
| Request Statement | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ❌ |
| Manage Residence | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ❌ |
| Register Visitors | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Register Vehicles | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Receive Notifications | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Gate Access | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Delegate Rights | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Receive News (suspended) | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |

Legend: ✅ Full | ⚠️ Delegated/Configurable | ❌ None

---

## Module Integration Points

| Module | Residents | Domestic Staff | Contractors | Estate Workers |
|--------|-----------|----------------|-------------|----------------|
| **Financial** | Role-based | ❌ No access | ❌ No access | ❌ No access |
| **WhatsApp Bot** | ✅ If verified | ⚠️ Notifications | ⚠️ Visitor invites | ❌ No access |
| **Portal Access** | ✅ If verified | ❌ No access | ❌ No access | ❌ No access |
| **Visitor Mgmt** | ✅ Full | ❌ No access | ✅ Invite only | ✅ Verification |
| **Gate Access** | ✅ Permanent | ✅ House-bound | ⚠️ Time-bound | ✅ Estate-wide |
| **Vehicle Reg** | ✅ Yes | ❌ No | ❌ No | ❌ No |
| **Access Cards** | ✅ UUID mapped | ✅ UUID mapped | ⚠️ Temp card | ✅ Badge |
| **Communications** | ✅ Per prefs | ⚠️ Limited | ❌ None | ⚠️ Internal |
| **Audit Trail** | ✅ All actions | ✅ All actions | ✅ All actions | ✅ All actions |
