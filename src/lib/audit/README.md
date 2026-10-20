# Audit Logging System

This module provides a comprehensive, extensible audit logging system for tracking all significant actions in the Residio application.

## Design Principles

1. **Minimal Friction** - Easy to add audit logging to any server action with a single function call
2. **Extensible** - New entity types can be added without schema changes
3. **Immutable** - Audit logs cannot be modified or deleted (append-only)
4. **Fail-Safe** - Audit failures don't break main operations (see [The audit recorder](#the-audit-recorder))
5. **Type-Safe** - Full TypeScript support with defined action and entity types

## Quick Start

### Basic Usage

Import the `logAudit` function and call it after successful operations:

```typescript
import { logAudit } from '@/lib/audit/logger';

// After creating an entity
export async function createSomething(data: CreateData) {
  // ... create logic ...

  if (newRecord) {
    await logAudit({
      action: 'CREATE',
      entityType: 'residents', // Use appropriate entity type
      entityId: newRecord.id,
      entityDisplay: `${newRecord.first_name} ${newRecord.last_name}`,
      newValues: newRecord,
    });
  }

  return { data: newRecord, error: null };
}
```

### Tracking Updates with Change Detection

For UPDATE operations, use the helper functions to track what changed:

```typescript
import { logAudit, getChangedValues } from '@/lib/audit/logger';

export async function updateSomething(id: string, updates: UpdateData) {
  // Get the current record before updating
  const { data: oldRecord } = await getRecord(id);

  // ... update logic ...

  if (updatedRecord) {
    // Only log fields that actually changed
    const changes = getChangedValues(oldRecord, updatedRecord);

    await logAudit({
      action: 'UPDATE',
      entityType: 'houses',
      entityId: id,
      entityDisplay: updatedRecord.house_number,
      oldValues: changes.old,
      newValues: changes.new,
      description: `Updated ${Object.keys(changes.new).join(', ')}`,
    });
  }

  return { data: updatedRecord, error: null };
}
```

## API Reference

### logAudit(options)

Main function to log an audit event.

```typescript
interface LogAuditOptions {
  action: AuditAction;        // Required: The type of action performed
  entityType: AuditEntityType; // Required: The type of entity affected
  entityId: string;           // Required: The ID of the affected entity
  entityDisplay?: string;     // Optional: Human-readable entity name
  oldValues?: Record<string, unknown>; // Optional: Previous values (for UPDATE)
  newValues?: Record<string, unknown>; // Optional: New values
  description?: string;       // Optional: Human-readable description
  metadata?: Record<string, unknown>;  // Optional: Additional context
}
```

### getChangedFields(oldValues, newValues)

Returns an array of field names that changed between two objects.

```typescript
const changedFields = getChangedFields(oldResident, updatedResident);
// Returns: ['first_name', 'phone_primary'] if those fields changed
```

### getChangedValues(oldValues, newValues)

Returns filtered objects containing only the changed fields.

```typescript
const changes = getChangedValues(oldResident, updatedResident);
// Returns: {
//   old: { first_name: 'John' },
//   new: { first_name: 'Johnny' }
// }
```

### formatChangeDescription(changedFields)

Creates a human-readable description of changes.

```typescript
const description = formatChangeDescription(['first_name', 'email']);
// Returns: "Changed first_name, email"
```

## The audit recorder

`src/lib/audit/recorder.ts` holds the audit recorder. It builds one Audit Entry (see `CONTEXT.md`) and writes it to `audit_logs`. `logAudit` is the entry point server actions call; the recorder is what it delegates to.

```typescript
import { recordAudit } from '@/lib/audit/recorder';

const { recorded } = await recordAudit(
  { action: 'UPDATE', entityType: 'houses', entityId: id, oldRow, newRow },
  { userId: auth.userId }, // the actor comes from the caller
);
```

`recordAudit(entry, actor, sink?)` returns `{ recorded: boolean }`.

**How the entry is built**

- **Diff.** When `oldRow` and `newRow` are both given, `getChangedValues` computes the old and new values, so only changed fields are stored. With only one of them, that row is stored whole. Explicit `oldValues` / `newValues` are written exactly as given and win over anything derived from rows (this is what legacy `logAudit` callers rely on).
- **Entity display.** An explicit `entityDisplay` wins. Otherwise `resolveEntityDisplay` looks at `newRow` (or `oldRow` when there is no `newRow`) and takes the first non-empty string among the candidate fields listed for that entity type in `ENTITY_DISPLAY_FIELDS`; a nested list of fields is joined with a space (for example a resident's `first_name` and `last_name`). If nothing resolves, `entity_display` is stored as `null`.
- **Actor.** The recorder takes the actor from the caller (`{ userId }`) and never looks the user up. A missing `userId` logs `[Audit] Cannot log audit: No authenticated user` and returns `{ recorded: false }`.

**The sink.** The recorder writes through an `AuditSink` (`insert(row)` returning `{ error }`). When none is passed it uses `createAuditSink()`, which inserts into `audit_logs` with the admin client, so the write does not depend on the actor's RLS context. Tests pass their own in-memory sink instead of touching a database; `fakeSink` in `src/lib/audit/__tests__/recorder.test.ts` is the example (it is a local test helper, not an exported module).

**How `logAudit` relates to it.** `logAudit` (`logger.ts`) is a thin delegate and remains the contract server actions use (`CORE.md` section 6). It makes exactly one `supabase.auth.getUser()` call and passes the resulting id to `recordAudit` as the actor. Reach for `recordAudit` directly only when the code already holds the actor.

**Failure policy: fail-safe.** `recordAudit` never throws. A missing actor, a sink error or an unexpected exception all return `{ recorded: false }` and the action being audited carries on. Failures are logged with an `[Audit] ...` prefix: a missing actor logs a plain message, and a sink error or unexpected exception logs an object of `{ entityType, entityId, action, error }`. Because the failure is only logged, a `recorded: false` result is the only signal that an entry was lost.

**Not supported: system and sessionless actors.** An Audit Entry needs a user id. Cron, webhook and pre-auth flows have none, so their writes cannot be audited through the recorder; this is tracked in #538. The scanner's `AUDIT_ALLOWLIST` lists the pre-auth and cron flows that cannot be audited this way (for example `auth/register-resident-portal` and `two-factor/verify`).

## Available Action Types

| Action | Description | When to Use |
|--------|-------------|-------------|
| `CREATE` | New entity created | After successful insert |
| `UPDATE` | Entity modified | After successful update |
| `DELETE` | Entity removed | After successful delete/soft-delete |
| `VERIFY` | Entity verified | After verification checks |
| `APPROVE` | Request approved | After approval workflows |
| `REJECT` | Request rejected | After rejection workflows |
| `ASSIGN` | Association created | After linking entities (e.g., resident to house) |
| `UNASSIGN` | Association removed | After unlinking entities |
| `ACTIVATE` | Entity activated | After enabling entity |
| `DEACTIVATE` | Entity deactivated | After disabling entity |
| `GENERATE` | Generated items | After invoice/levy generation |
| `ALLOCATE` | Allocation made | After wallet allocations |
| `LOGIN` | User logged in | Future: auth events |
| `LOGOUT` | User logged out | Future: auth events |

## Available Entity Types

| Entity Type | Description |
|-------------|-------------|
| `residents` | Resident records |
| `houses` | House/property records |
| `resident_houses` | Resident-house assignments |
| `invoices` | Invoice records |
| `payments` | Payment records |
| `billing_profiles` | Billing profile configs |
| `wallets` | Resident wallet records |
| `approval_requests` | Maker-checker requests |
| `streets` | Street reference data |
| `house_types` | House type reference data |
| `security_contacts` | Security contact list (Phase 6) |
| `profiles` | User profile management |

The table above is a sample, not the full list. `AuditEntityType` in `src/types/database.ts` is the source of truth.

## Adding New Entity Types

To add a new entity type for future modules:

1. Update the `AuditEntityType` type in `src/types/database.ts`:
   ```typescript
   export type AuditEntityType =
     | 'residents'
     | 'houses'
     // ... existing types
     | 'your_new_entity';
   ```

2. Add the label in `AUDIT_ENTITY_LABELS`:
   ```typescript
   export const AUDIT_ENTITY_LABELS: Record<AuditEntityType, string> = {
     // ... existing labels
     your_new_entity: 'Your New Entity',
   };
   ```

3. Add an entry for it in `ENTITY_DISPLAY_FIELDS` in `src/lib/audit/recorder.ts` (the fields that name the entity, or `['name', 'title', 'display_name']` as the default). `ENTITY_DISPLAY_FIELDS` and `AUDIT_ENTITY_LABELS` are both typed `Record<AuditEntityType, ...>`, so `npx tsc --noEmit` fails until both have the new member.

4. Start using `logAudit` in your server actions with the new entity type.

## Examples

### Example 1: Creating a Resident

```typescript
export async function createResident(formData: ResidentFormData) {
  // ... validation and creation logic ...

  const { data: newResident, error } = await supabase
    .from('residents')
    .insert(insertData)
    .select()
    .single();

  if (newResident) {
    await logAudit({
      action: 'CREATE',
      entityType: 'residents',
      entityId: newResident.id,
      entityDisplay: `${newResident.first_name} ${newResident.last_name}`,
      newValues: {
        first_name: newResident.first_name,
        last_name: newResident.last_name,
        email: newResident.email,
        phone_primary: newResident.phone_primary,
      },
    });
  }

  return { data: newResident, error: null };
}
```

### Example 2: Approving a Request

```typescript
export async function approveRequest(requestId: string, notes?: string) {
  // ... approval logic ...

  if (approved) {
    await logAudit({
      action: 'APPROVE',
      entityType: 'approval_requests',
      entityId: requestId,
      entityDisplay: `Request #${requestId.slice(0, 8)}`,
      oldValues: { status: 'pending' },
      newValues: { status: 'approved' },
      description: notes || 'Request approved',
      metadata: {
        request_type: request.request_type,
        entity_affected: request.entity_id,
      },
    });
  }

  return { success: true, error: null };
}
```

### Example 3: Assigning a Resident to a House

```typescript
export async function assignHouse(residentId: string, houseId: string, role: ResidentRole) {
  // ... assignment logic ...

  if (assignment) {
    await logAudit({
      action: 'ASSIGN',
      entityType: 'resident_houses',
      entityId: assignment.id,
      entityDisplay: `${resident.first_name} ${resident.last_name} → ${house.house_number}`,
      newValues: {
        resident_id: residentId,
        house_id: houseId,
        resident_role: role,
      },
      metadata: {
        resident_name: `${resident.first_name} ${resident.last_name}`,
        house_address: house.house_number,
      },
    });
  }

  return { data: assignment, error: null };
}
```

### Example 4: Generating Invoices

```typescript
export async function generateMonthlyInvoices(month: string) {
  // ... generation logic ...

  // Log the batch generation
  await logAudit({
    action: 'GENERATE',
    entityType: 'invoices',
    entityId: batchId,
    entityDisplay: `Monthly Invoices - ${month}`,
    newValues: {
      count: generatedInvoices.length,
      total_amount: totalAmount,
    },
    description: `Generated ${generatedInvoices.length} invoices for ${month}`,
    metadata: {
      month,
      billing_profile_ids: profileIds,
      invoice_ids: generatedInvoices.map(i => i.id),
    },
  });

  return { data: generatedInvoices, error: null };
}
```

## Viewing Audit Logs

Audit logs can be viewed at `/system/audit-logs` by users with the `settings.view_audit_logs` permission. The `super_admin` and `vice_chairman` roles hold it; `chairman` does not.

Features:
- Filter by entity type, action type, actor, and date range
- Search by entity name or description
- Quick date presets (Today, Last 7 Days, Last 30 Days)
- Detailed view showing old/new value comparison
- Statistics cards showing activity counts

## Handling Deleted Profiles

The audit logs system is designed to preserve historical records even when user profiles are deleted from the system.

**Database Behavior**:
- The `actor_id` column has a foreign key constraint to `profiles.id` with `ON DELETE SET NULL`
- When a profile is deleted, all their audit log entries are preserved with `actor_id = NULL`
- This ensures compliance requirements are met even when users are removed

**UI Handling**:
- The `AuditLogWithActor` type has `actor` as a nullable field
- The UI displays "Unknown" for entries where the actor profile was deleted
- Always use optional chaining when accessing actor details:
  ```typescript
  log.actor?.full_name || 'Unknown'
  log.actor?.email || 'N/A'
  ```

**Example**:
```typescript
// In components
<div>{log.actor?.full_name || 'Unknown User'}</div>
<div className="text-muted-foreground">{log.actor?.email || 'Deleted Profile'}</div>
```

## Security Considerations

1. **RLS Policies**: SELECT follows the `settings.view_audit_logs` permission (see Viewing Audit Logs)
2. **Immutability**: No UPDATE or DELETE policies exist (append-only)
3. **No INSERT policy**: the "Authenticated users can insert audit logs" policy was dropped in `20261012200000_drop_forged_insert_policies.sql` (#471), so clients cannot insert. Entries are written by the recorder's admin-client sink, which bypasses RLS
4. **No sensitive data**: Avoid logging passwords, tokens, or PII in values
5. **Deleted Profiles**: Audit trail is preserved with `ON DELETE SET NULL` on actor_id

## Best Practices

1. **Always log after successful operations** - Don't log before the operation completes
2. **Use meaningful entityDisplay values** - Makes the audit log human-readable
3. **Track only changed fields for UPDATE** - Use `getChangedValues()` helper
4. **Add context via metadata** - Helps with debugging and understanding
5. **Keep descriptions concise** - One sentence describing the action
6. **Don't log sensitive data** - Exclude passwords, API keys, tokens
