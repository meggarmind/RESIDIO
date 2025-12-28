# Access Control & Security

This document covers authentication, role-based access control, route protection, row-level security, and audit logging.

---

## Authentication Flow

Residio uses Supabase Auth with email/password authentication.

### Login Flow
1. User submits email/password on `/login`
2. Supabase Auth validates credentials
3. Session cookie set via `@supabase/ssr`
4. Middleware checks session on each request
5. Redirect to `/dashboard` on success

### Auth Callback
Route: `src/app/api/auth/callback/route.ts`

Handles OAuth redirects and email confirmation links.

---

## Role-Based Access Control (RBAC)

### System Roles

| Role | Description | Access Level |
|------|-------------|--------------|
| `admin` | Full system access | All modules, all operations |
| `chairman` | Estate chairman | Resident, house, payment management |
| `financial_secretary` | Financial officer | Resident, house, payment management |
| `security_officer` | Security staff | Read-only security contacts |

### Flexible RBAC (Phase 10)

The system supports 7+ configurable roles with granular permissions:
- 42 permissions across 10 categories
- EXCO/BOT organizational structure support
- Role assignment restricted to residents only
- Permission-based sidebar navigation

### Role Configuration

Roles are defined in the `roles` table with permission arrays:

```sql
CREATE TABLE roles (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  display_name text NOT NULL,
  description text,
  permissions text[] DEFAULT '{}',
  is_system_role boolean DEFAULT false,
  category text, -- 'exco' | 'bot' | 'staff' | 'custom'
  created_at timestamptz DEFAULT now()
);
```

---

## Route Protection

### Middleware

Location: `src/middleware.ts`

Protects routes based on user roles:
- Protected routes: `/dashboard`, `/residents`, `/payments`, `/security`, `/admin`, `/settings`
- Unauthenticated users → redirected to `/login`
- Authenticated users on `/login` → redirected to `/dashboard`

### Route Access Configuration

```typescript
const routeRoleConfig = {
  '/admin': ['admin'],
  '/residents': ['admin', 'chairman', 'financial_secretary'],
  '/payments': ['admin', 'chairman', 'financial_secretary'],
  '/security': ['admin', 'chairman', 'security_officer'],
  '/dashboard': [], // All authenticated users
  '/settings': ['admin', 'chairman'],
};
```

### Permission Helpers

In auth context (`src/lib/auth/auth-context.tsx`):

```typescript
const { hasPermission, hasAnyPermission } = useAuth();

// Check single permission
if (hasPermission('residents.create')) {
  // Show create button
}

// Check any of multiple permissions
if (hasAnyPermission(['payments.view', 'payments.create'])) {
  // Show payments section
}
```

---

## Row-Level Security (RLS)

All tables have RLS enabled with policies based on user roles.

### get_my_role() Function

A `SECURITY DEFINER` function that avoids RLS recursion:

```sql
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM profiles
  WHERE id = auth.uid();

  RETURN COALESCE(user_role, 'authenticated');
END;
$$;
```

### is_super_admin() Function

For admin bypass checks:

```sql
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
END;
$$;
```

### Example RLS Policy

```sql
-- Allow admins and chairmen to view all residents
CREATE POLICY "Admins and chairmen can view residents"
ON residents FOR SELECT
USING (
  get_my_role() IN ('admin', 'chairman', 'financial_secretary')
);

-- Allow admins to modify residents
CREATE POLICY "Admins can modify residents"
ON residents FOR ALL
USING (is_super_admin());
```

---

## Audit Logging

### Overview

Immutable, append-only audit trail for all data modifications.

- Location: `src/lib/audit/`
- Documentation: `src/lib/audit/README.md`
- Viewer: `/settings/audit-logs` (admin/chairman only)

### logAudit() Utility

```typescript
import { logAudit } from '@/lib/audit/logger';

// After CREATE operations
await logAudit({
  action: 'CREATE',
  entityType: 'residents',
  entityId: newRecord.id,
  entityDisplay: 'John Doe',
  newValues: newRecord,
});

// After UPDATE operations
import { logAudit, getChangedValues } from '@/lib/audit/logger';

const changes = getChangedValues(oldRecord, updatedRecord);
await logAudit({
  action: 'UPDATE',
  entityType: 'houses',
  entityId: id,
  entityDisplay: house.house_number,
  oldValues: changes.old,
  newValues: changes.new,
});

// After DELETE operations
await logAudit({
  action: 'DELETE',
  entityType: 'invoices',
  entityId: deletedId,
  entityDisplay: invoice.invoice_number,
  oldValues: deletedRecord,
});
```

### Available Actions

```typescript
type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'VERIFY'
  | 'APPROVE'
  | 'REJECT'
  | 'ASSIGN'
  | 'UNASSIGN'
  | 'ACTIVATE'
  | 'DEACTIVATE'
  | 'GENERATE'
  | 'ALLOCATE';
```

### Available Entity Types

```typescript
type AuditEntityType =
  | 'residents'
  | 'houses'
  | 'resident_houses'
  | 'invoices'
  | 'payments'
  | 'billing_profiles'
  | 'wallets'
  | 'approval_requests'
  | 'streets'
  | 'house_types'
  | 'security_contacts'
  | 'profiles'
  | 'notification_templates'
  | 'notification_schedules';
```

### Adding New Entity Types

1. Update `AuditEntityType` in `src/types/database.ts`
2. Add label in `AUDIT_ENTITY_LABELS` constant

### Key Points

- Call `logAudit()` **AFTER** successful operations (not before)
- Audit logging is fail-safe - won't break main operations if logging fails
- Only admin/chairman can view audit logs
- Actor deletion doesn't break audit trail (uses `ON DELETE SET NULL`)

### Null Actor Handling

```typescript
// AuditLogWithActor type has actor as nullable
type AuditLogWithActor = AuditLog & {
  actor: { full_name: string; email: string } | null;
};

// Always use optional chaining
log.actor?.full_name || 'Unknown'
log.actor?.email || 'N/A'
```

---

## Security Best Practices

### Input Validation
- All forms use Zod schemas
- Validators in `src/lib/validators/`
- Server-side validation in server actions

### Authorization Checks
- Every server action checks user role before mutation
- Use `authorizeAction()` helper from `src/lib/auth/authorize.ts`

### SQL Injection Prevention
- Use Supabase query builder (parameterized queries)
- Never interpolate user input into raw SQL

### XSS Prevention
- React auto-escapes JSX content
- Avoid rendering raw HTML from user input
- If HTML rendering is required, sanitize with DOMPurify first

### CSRF Protection
- Server actions are POST-only
- Supabase session cookies are HTTP-only

### Sensitive Data
- Never log passwords or tokens
- Environment variables for secrets
- Service role key only on server

---

## Security Contact Management

The security module has its own permission system with 11 granular permissions:

| Permission | Description |
|------------|-------------|
| `security.contacts.view` | View security contacts |
| `security.contacts.create` | Register new contacts |
| `security.contacts.edit` | Edit contact details |
| `security.contacts.delete` | Remove contacts |
| `security.codes.generate` | Generate access codes |
| `security.codes.revoke` | Revoke access codes |
| `security.logs.view` | View access logs |
| `security.logs.record` | Record check-in/out |
| `security.settings.view` | View security settings |
| `security.settings.edit` | Modify security settings |
| `security.export` | Export CSV reports |

Configuration: `/settings/security`
