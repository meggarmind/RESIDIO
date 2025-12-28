# Database Schema

This document describes the Residio database architecture, including core entities, relationships, triggers, and enums.

---

## Directory Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Auth pages (login)
│   ├── (dashboard)/       # Dashboard protected routes
│   │   ├── dashboard/     # Dashboard home
│   │   ├── houses/        # House management
│   │   ├── residents/     # Resident management
│   │   ├── payments/      # Payment records
│   │   ├── billing/       # Billing & invoices
│   │   ├── security/      # Security contacts
│   │   └── settings/      # Application settings
│   └── api/               # API routes
├── actions/               # Server actions (data layer)
│   ├── billing/          # Invoice generation, wallet
│   ├── dashboard/        # Dashboard stats
│   ├── houses/           # House CRUD
│   ├── payments/         # Payment CRUD
│   ├── reference/        # Streets, house types
│   └── residents/        # Resident CRUD
├── components/
│   ├── ui/               # shadcn/ui base components
│   ├── admin/            # Reference management
│   ├── billing/          # Billing forms
│   ├── dashboard/        # Sidebar, header, navigation
│   ├── houses/           # House table, form
│   ├── payments/         # Payment table, form, filters
│   └── residents/        # Resident table, form
├── hooks/                # React Query hooks
│   ├── use-billing.ts
│   ├── use-dashboard.ts
│   ├── use-houses.ts
│   ├── use-payments.ts
│   ├── use-reference.ts
│   └── use-residents.ts
├── lib/
│   ├── auth/             # Auth provider
│   ├── supabase/         # Supabase clients
│   ├── validators/       # Zod schemas
│   └── utils.ts          # Utility functions
└── types/
    ├── database.ts       # Database type definitions
    └── database.generated.ts  # Auto-generated from schema

supabase/
├── config.toml           # Supabase CLI config
├── migrations/           # SQL migration files
└── seed.sql             # Test user seed data
```

---

## Core Entities

### User & Auth

| Table | Description |
|-------|-------------|
| `profiles` | User accounts with roles, linked to Supabase Auth |
| `roles` | Configurable roles with permission arrays |
| `role_assignments` | Junction table linking residents to roles |

### Property

| Table | Description |
|-------|-------------|
| `streets` | Street reference data with short names |
| `house_types` | House type reference data with billing profiles |
| `houses` | Properties in the estate with occupancy status |

### Residents

| Table | Description |
|-------|-------------|
| `residents` | Community members with auto-generated codes |
| `resident_houses` | Junction table (many-to-many) for property assignments |

### Financial

| Table | Description |
|-------|-------------|
| `payment_records` | Payment history with status tracking |
| `wallets` | Resident wallet balances |
| `wallet_transactions` | Wallet credit/debit history |
| `billing_profiles` | Fee schedules and billing configurations |
| `invoices` | Generated invoices per resident |
| `invoice_items` | Line items within invoices |

### Security

| Table | Description |
|-------|-------------|
| `security_contacts` | Visitor/staff access with validity periods |
| `security_contact_categories` | Configurable contact categories |
| `access_codes` | Permanent and one-time access codes |
| `access_logs` | Check-in/check-out recording |

### Notifications

| Table | Description |
|-------|-------------|
| `notification_templates` | Message templates with variables |
| `notification_schedules` | Trigger rules for automated notifications |
| `notification_queue` | Pending notifications to send |
| `notification_history` | Sent notification records |
| `notification_preferences` | Per-resident channel preferences |

### System

| Table | Description |
|-------|-------------|
| `audit_logs` | Immutable activity logs |
| `system_settings` | Application configuration key-value store |
| `approval_requests` | Maker-checker workflow queue |

---

## Key Features

### Auto-Generated Resident Codes
- 6-digit numeric codes assigned via database trigger
- Unique across all residents
- Cannot be manually overridden

### House Occupancy Tracking
- `is_occupied` boolean auto-updated via trigger
- Tracks when residents are assigned/removed from properties
- Supports ownership history events

### Primary Residence Enforcement
- Each resident can have only one primary residence
- Enforced by database trigger
- Non-primary assignments allowed for multi-property owners

### Emergency Contacts
- Can link to existing resident (by ID)
- Or manual entry with name/phone

### Billing Profiles
- Attached to house types for automated invoice generation
- Supports one-time levies and recurring fees
- Development levy flag for flat-fee billing

---

## Database Triggers

### `generate_resident_code()`
- **Fires**: BEFORE INSERT on `residents`
- **Purpose**: Generates unique 6-digit resident code
- **Logic**: Random generation with collision checking

### `update_house_occupancy()`
- **Fires**: AFTER INSERT/DELETE on `resident_houses`
- **Purpose**: Updates `houses.is_occupied` based on active assignments
- **Logic**: Sets `is_occupied = TRUE` if any resident linked

### `enforce_primary_residence()`
- **Fires**: BEFORE INSERT/UPDATE on `resident_houses`
- **Purpose**: Ensures only one primary residence per resident
- **Logic**: Clears previous primary if new assignment is marked primary

### `create_wallet_for_resident()`
- **Fires**: AFTER INSERT on `residents`
- **Purpose**: Auto-creates wallet with zero balance
- **Logic**: Inserts into `wallets` with `resident_id`

### `create_profile_for_user()`
- **Fires**: AFTER INSERT on `auth.users`
- **Purpose**: Creates `profiles` record on Supabase Auth signup
- **Logic**: Copies email and sets default role

---

## Enums

### `resident_role`
```sql
'owner' | 'tenant' | 'occupier' | 'domestic_staff' | 'household_member'
```

### `resident_status`
```sql
'active' | 'inactive' | 'pending' | 'suspended'
```

### `payment_status`
```sql
'pending' | 'completed' | 'failed' | 'refunded'
```

### `invoice_status`
```sql
'draft' | 'pending' | 'paid' | 'partially_paid' | 'overdue' | 'cancelled'
```

### `security_contact_status`
```sql
'active' | 'suspended' | 'expired' | 'revoked'
```

### `access_code_type`
```sql
'permanent' | 'one_time'
```

### `id_document_type`
```sql
'national_id' | 'drivers_license' | 'passport' | 'voters_card' | 'other'
```

### `notification_channel`
```sql
'email' | 'sms' | 'whatsapp' | 'in_app'
```

### `audit_action`
```sql
'CREATE' | 'UPDATE' | 'DELETE' | 'VERIFY' | 'APPROVE' | 'REJECT' |
'ASSIGN' | 'UNASSIGN' | 'ACTIVATE' | 'DEACTIVATE' | 'GENERATE' | 'ALLOCATE'
```

---

## Entity Relationships

```
profiles ─────────────────┐
    │                     │
    └── role_assignments ─┘
            │
            ▼
         roles

streets ◄── houses ──► house_types
              │
              └── resident_houses ──► residents ──► wallets
                        │                  │
                        │                  └── wallet_transactions
                        │
                        └── invoices ──► invoice_items
                              │
                              └── payment_records

residents ──► security_contacts ──► access_codes
                     │
                     └── access_logs

notification_templates ──► notification_schedules
                               │
                               └── notification_queue ──► notification_history
                                                              │
                                                              └── notification_preferences
```

---

## Type Definitions

Database types are defined in two files:

- `src/types/database.ts` - Manual type definitions with convenience aliases
- `src/types/database.generated.ts` - Auto-generated from schema via `npm run db:types`

### Convenience Type Aliases

```typescript
// From src/types/database.ts
export type Resident = Tables<'residents'>;
export type House = Tables<'houses'>;
export type ResidentWithHouses = Resident & { houses: House[] };
export type HouseWithResidents = House & { residents: Resident[] };
export type PaymentRecord = Tables<'payment_records'>;
export type Invoice = Tables<'invoices'>;
export type SecurityContact = Tables<'security_contacts'>;
export type AuditLog = Tables<'audit_logs'>;
```

---

## Migrations

All migrations are stored in `supabase/migrations/` with timestamp prefixes.

To regenerate TypeScript types after schema changes:
```bash
npm run db:types
```

For detailed migration commands, see [Supabase Integration](../api/supabase-integration.md#mcp-tools-reference).
