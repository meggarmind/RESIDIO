# Design Guide: Sortable + Clickable DataTable

> Reusable pattern for admin registry tables in Residio.
> Reference implementations: `residents-table.tsx`, `houses-table.tsx`.

---

## 1. Schema (Zod search params)

Add `sort_by` and `sort_order` to the search/filter schema in `src/lib/validators/<entity>.ts`:

```ts
export const entitySearchSchema = z.object({
  // ...existing filters...
  sort_by: z.enum(['column_a', 'column_b', 'column_c']).optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
});

export type EntitySearchParams = z.infer<typeof entitySearchSchema>;
```

**Rules:**
- `sort_by` enum values = the sortable column identifiers (not necessarily DB column names — they're logical keys you map in the action).
- `sort_order` is always `'asc' | 'desc'`.
- Both are optional — when omitted, the action falls back to its default ordering (usually `created_at desc`).

---

## 2. Server Action (dynamic ordering)

In `src/actions/<entity>/get-<entity>.ts`, destructure `sort_by` and `sort_order`, then branch the `.order()` call:

```ts
export async function getEntities(params: Partial<EntitySearchParams> = {}) {
  const supabase = await createServerSupabaseClient();
  const { /* ...filters... */, sort_by, sort_order, page = 1, limit = 20 } = params;

  let query = supabase
    .from('entities')
    .select(`
      *,
      street:streets(*),
      type:entity_types(*)
    `, { count: 'exact' });

  // ...apply filters...

  // Pagination + sorting
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const ascending = sort_order !== 'desc'; // default asc

  if (sort_by === 'column_a') {
    query = query.order('column_a', { ascending });
  } else if (sort_by === 'column_b') {
    query = query.order('column_b', { ascending });
  } else if (sort_by === 'joined_column') {
    // For columns on a joined table, use referencedTable
    query = query.order('name', { ascending, referencedTable: 'street' });
  } else {
    // Default fallback ordering
    query = query.order('created_at', { ascending: false });
  }

  const { data, error, count } = await query;
  // ...return...
}
```

**Key points:**
- `referencedTable` is required when sorting by a column on a joined relation (e.g. `street.name`, `house_type.name`).
- The Supabase JS client v2 supports `referencedTable` on `.order()` — but **not** on `.eq()`, `.gt()`, etc. For those, use the dotted-column string syntax (e.g. `'access_codes.is_active'`) and ensure the relation is in the `select` via `!inner` if it's a `head: true` count query.
- Always provide a fallback `else` branch so the table works without explicit sorting.

---

## 3. Table Component — Sort State

Add sort state and a handler to the main table component:

```tsx
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export function EntitiesTable() {
  const router = useRouter();
  // ...existing filter state...
  const [sortBy, setSortBy] = useState<'column_a' | 'column_b' | 'joined_column' | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleSort = useCallback((column: 'column_a' | 'column_b' | 'joined_column') => {
    if (sortBy === column) {
      // Toggle direction on same column
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // New column — start ascending
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(1); // Reset to first page on sort change
  }, []);

  const handleNavigate = useCallback((id: string) => {
    router.push(`/entities/${id}`);
  }, [router]);
```

Wire sort params into the query:

```tsx
const params: Partial<EntitySearchParams> = {
  // ...existing filters...
  sort_by: sortBy,
  sort_order: sortBy ? sortOrder : undefined,  // only send sort_order if sort_by is set
  page,
  limit,
};
```

---

## 4. Sortable Header UI

Each sortable column header is a `<button>` with a sort indicator icon:

```tsx
<TableHead>
  <button
    className="flex items-center gap-1 hover:text-foreground transition-colors font-medium"
    onClick={() => handleSort('column_a')}
  >
    Column Label
    {sortBy === 'column_a' ? (
      sortOrder === 'asc'
        ? <ChevronUp className="h-3.5 w-3.5" />
        : <ChevronDown className="h-3.5 w-3.5" />
    ) : (
      <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
    )}
  </button>
</TableHead>
```

**Icon semantics:**
| State | Icon | Meaning |
|-------|------|---------|
| Not sorted | `ChevronsUpDown` (muted) | Click to sort ascending |
| Sorted ascending | `ChevronUp` | Click to sort descending |
| Sorted descending | `ChevronDown` | Click to sort ascending |

**Non-sortable headers** remain plain `<TableHead>Label</TableHead>` — no button wrapper.

---

## 5. Clickable Row Pattern

### Row component (memoized)

```tsx
const EntityRow = memo(function EntityRow({
  entity,
  onNavigate,
}: {
  entity: EntityData;
  onNavigate: (id: string) => void;
}) {
  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => onNavigate(entity.id)}
    >
      <TableCell>...</TableCell>
      {/* ...other cells... */}
      <TableCell className="text-right">
        {/* Edit button stays — with stopPropagation */}
        <Button
          variant="ghost"
          size="icon"
          asChild
          aria-label="Edit entity"
          onClick={(e) => e.stopPropagation()}
        >
          <Link href={`/entities/${entity.id}?edit=true`}>
            <Pencil className="h-4 w-4" />
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
});
```

### Rendering rows

```tsx
data?.data.map((entity) => (
  <EntityRow key={entity.id} entity={entity} onNavigate={handleNavigate} />
))
```

**Rules:**
- Remove the Eye/view icon button — the entire row is the click target.
- Keep the Pencil/edit button in the Actions column, but add `onClick={(e) => e.stopPropagation()}` so clicking edit doesn't trigger row navigation.
- Use `router.push()` via the `onNavigate` callback — don't wrap `<TableRow>` in `<Link>` (invalid HTML: `<a><tr>`).
- The `aria-label` on the edit button ensures screen reader accessibility.

---

## 6. Default Sort Behavior

| Scenario | Ordering |
|----------|----------|
| No sort state (initial load) | `created_at DESC` (most recent first) |
| User clicks a column once | That column ASC |
| User clicks same column again | That column DESC |
| User clicks a different column | New column ASC (resets direction) |
| User changes filters/search | Current sort is preserved; page resets to 1 |

---

## 7. Checklist for New Tables

When applying this pattern to a new registry table:

- [ ] Add `sort_by` + `sort_order` to the Zod search schema
- [ ] Update the server action to branch `.order()` calls
- [ ] For joined-table columns, use `referencedTable` in `.order()`
- [ ] Add `sortBy` + `sortOrder` state to the table component
- [ ] Add `handleSort` callback (toggle asc/desc, reset page)
- [ ] Wire `sort_by`/`sort_order` into the `params` object
- [ ] Wrap sortable header labels in `<button>` + sort indicator icons
- [ ] Add `cursor-pointer` + `hover:bg-muted/50` + `onClick` to `<TableRow>`
- [ ] Remove the Eye/view icon button from the Actions column
- [ ] Keep Pencil/edit button with `onClick={(e) => e.stopPropagation()}`
- [ ] Pass `onNavigate` callback to the memoized row component
- [ ] Add `aria-label` to any remaining icon-only buttons
- [ ] Test that clicking a row navigates; clicking edit navigates to edit page; clicking header sorts

---

## 8. Reference Files

| File | What to copy |
|------|-------------|
| `src/lib/validators/resident.ts` | Schema with `sort_by`/`sort_order` |
| `src/actions/residents/get-residents.ts` | Dynamic `.order()` branching |
| `src/components/residents/residents-table.tsx` | Sort state + sortable headers + clickable rows |
| `src/components/houses/houses-table.tsx` | Same pattern with `referencedTable` for joined columns |