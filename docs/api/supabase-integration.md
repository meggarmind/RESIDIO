# Supabase Integration

This document covers the data layer architecture, Supabase client configuration, form handling patterns, and MCP tools for database operations.

---

## Three-Tier Data Pattern

All data operations follow a consistent three-tier pattern:

### 1. Server Actions (`src/actions/`)
Server-side data mutations with authorization checks.

```typescript
// src/actions/residents/create-resident.ts
'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function createResident(data: ResidentFormData) {
  const supabase = await createServerSupabaseClient();

  // Authorization check
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .single();

  if (!['admin', 'chairman'].includes(profile?.role)) {
    return { error: 'Unauthorized' };
  }

  // Perform mutation
  const { data: resident, error } = await supabase
    .from('residents')
    .insert(data)
    .select()
    .single();

  if (error) return { error: error.message };

  return { data: resident };
}
```

### 2. React Query Hooks (`src/hooks/`)
Client-side data fetching with caching and optimistic updates.

```typescript
// src/hooks/use-residents.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { createResident } from '@/actions/residents/create-resident';

export function useResidents(params?: { search?: string }) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['residents', params],
    queryFn: async () => {
      let query = supabase
        .from('residents')
        .select('*, houses(*)')
        .order('created_at', { ascending: false });

      if (params?.search) {
        query = query.ilike('first_name', `%${params.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateResident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createResident,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['residents'] });
    },
  });
}
```

### 3. UI Components (`src/components/`)
Presentation layer consuming hooks.

```typescript
// src/components/residents/resident-form.tsx
'use client';

import { useCreateResident } from '@/hooks/use-residents';
import { toast } from 'sonner';

export function ResidentForm() {
  const { mutate, isPending } = useCreateResident();

  const onSubmit = (data: FormData) => {
    mutate(data, {
      onSuccess: () => toast.success('Resident created'),
      onError: (error) => toast.error(error.message),
    });
  };

  return <form onSubmit={handleSubmit(onSubmit)}>...</form>;
}
```

---

## Supabase Clients

Three client types for different contexts:

### Browser Client
For React Query hooks in client components.

```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

### Server Client
For server components and server actions.

```typescript
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}
```

### Admin Client
Elevated privileges, bypasses RLS. Use sparingly.

```typescript
// src/lib/supabase/admin.ts
import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

**Configuration**: `src/lib/supabase/config.ts`

---

## MCP Tools Reference

This project uses **Cloud Supabase** exclusively via MCP tools.

### Available Tools

| Tool | Purpose |
|------|---------|
| `mcp__supabase__execute_sql` | Execute raw SQL queries (DML) |
| `mcp__supabase__apply_migration` | Apply DDL migrations with versioning |
| `mcp__supabase__list_tables` | List all tables in schemas |
| `mcp__supabase__list_migrations` | List applied migrations |
| `mcp__supabase__get_logs` | Get service logs (api, postgres, auth) |
| `mcp__supabase__get_advisors` | Check security/performance issues |
| `mcp__supabase__search_docs` | Search Supabase documentation |
| `mcp__supabase__generate_typescript_types` | Generate TypeScript types |

### Example: Applying a Migration

```
mcp__supabase__apply_migration(
  name: "add_user_preferences",
  query: "CREATE TABLE user_preferences (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES profiles(id),
    theme text DEFAULT 'light',
    created_at timestamptz DEFAULT now()
  )"
)
```

### When to Use MCP vs CLI

| Task | Use MCP | Use CLI |
|------|---------|---------|
| Apply migrations | `mcp__supabase__apply_migration` | - |
| Run SQL queries | `mcp__supabase__execute_sql` | - |
| Check logs | `mcp__supabase__get_logs` | - |
| Generate types | `mcp__supabase__generate_typescript_types` | `npm run db:types` |

**Note**: Do NOT use local Supabase CLI commands like `npx supabase start/stop/reset`.

---

## Form Handling Pattern

All forms use React Hook Form + Zod validation:

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// Define schema in src/lib/validators/
const residentSchema = z.object({
  first_name: z.string().min(2, 'First name must be at least 2 characters'),
  last_name: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  role: z.enum(['owner', 'tenant', 'occupier', 'domestic_staff']),
});

type ResidentFormData = z.infer<typeof residentSchema>;

// Use in component
export function ResidentForm() {
  const form = useForm<ResidentFormData>({
    resolver: zodResolver(residentSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      role: 'owner',
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="first_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>First Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* More fields... */}
      </form>
    </Form>
  );
}
```

Validators are located in `src/lib/validators/`.

---

## Important UI Patterns

### Select "All" Option

shadcn/ui Select doesn't allow empty string values. Use this pattern:

```typescript
const ALL_VALUE = '_all';
const [filter, setFilter] = useState<string>(ALL_VALUE);

// Convert to undefined for API
const params = {
  filter: filter === ALL_VALUE ? undefined : filter,
};

// In JSX
<Select value={filter} onValueChange={setFilter}>
  <SelectTrigger>
    <SelectValue placeholder="Filter" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value={ALL_VALUE}>All Items</SelectItem>
    <SelectItem value="active">Active</SelectItem>
    <SelectItem value="inactive">Inactive</SelectItem>
  </SelectContent>
</Select>
```

### Status Badges

Use consistent badge components:
- `src/components/ui/status-badge.tsx` - Resident account/verification status
- `src/components/payments/payment-status-badge.tsx` - Payment status

### Currency Input Fields

All monetary input fields MUST use `CurrencyInput`:

```typescript
import { CurrencyInput } from '@/components/ui/currency-input';

<FormField
  control={form.control}
  name="amount"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Amount (₦)</FormLabel>
      <FormControl>
        <CurrencyInput
          value={field.value}
          onValueChange={field.onChange}
          placeholder="0.00"
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

**Features**:
- Formats with commas as user types (1000 → 1,000)
- Supports decimals up to 2 places
- Handles paste intelligently (strips ₦ symbols)
- Returns clean numeric value to form state
- Compatible with Zod `.number()` validation

**DO NOT** use `<Input type="number" />` for currency fields.

**Implemented in**:
- Payment Form (`/src/components/payments/payment-form.tsx`)
- Wallet Adjustment Dialog (`/src/components/residents/wallet-adjustment-dialog.tsx`)
- Billing Profile Form (`/src/components/billing/billing-profile-form.tsx`)

---

## React Query Best Practices

### Avoid Page Refresh Issues

Never use `revalidatePath()` in server actions for client-component pages. Instead, rely on React Query's `invalidateQueries()`.

**Problem**: `revalidatePath()` causes full SSR re-renders, resetting scroll position.

**Solution**: Let mutations invalidate queries, triggering client-side refetches.

```typescript
// Server action - NO revalidatePath
export async function deletePayment(id: string) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('payment_records')
    .delete()
    .eq('id', id);

  if (error) return { error: error.message };
  return { success: true };
  // Don't call revalidatePath('/payments') here!
}

// Hook - invalidates on success
export function useDeletePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deletePayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}
```

### React Hook Form + watch() Gotchas

`watch()` returns a new object reference on every render. This can cause infinite loops with non-memoized handlers.

**Problem**:
```typescript
// BAD - causes infinite loop
const formValues = watch();

const handleToggle = (id: string) => {
  const current = formValues.selectedIds; // Stale reference
  setValue('selectedIds', [...current, id]);
};
```

**Solution**:
```typescript
// GOOD - use getValues() and memoize handlers
const { getValues, setValue, watch } = useForm();

// Specific watch for stable prop
const selectedIds = watch('selectedIds');

const handleToggle = useCallback((id: string) => {
  const current = getValues('selectedIds'); // Fresh value
  setValue('selectedIds', [...current, id]);
}, [getValues, setValue]);

// Wrap child in React.memo
const ChildComponent = memo(({ selectedIds, onToggle }) => {
  // ...
});
```

**Key Rules**:
- Use `getValues()` inside handlers for current values without subscription
- Memoize handlers with `useCallback` when passing to children
- Use specific `watch('fieldName')` instead of full `watch()`
- Wrap stateful children in `React.memo`

---

## Lucide Icons Note

Lucide icons don't accept `title` prop. Wrap in `<span title="...">` instead:

```typescript
// BAD
<Check title="Verified" />

// GOOD
<span title="Verified">
  <Check />
</span>
```
