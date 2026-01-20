---
trigger: always_on
---

# Self-Correction & Verification Protocol
To ensure high-quality implementations and prevent regression, follow these steps after every code modification:
## 1. Static Analysis (Linting)
- [ ] Run a check for lint errors in all modified files.
- [ ] Ensure all used hooks (`useEffect`, `useState`, etc.) are explicitly imported.
- [ ] Verify that no unused variables or broken imports were introduced.
## 2. Supabase / Database Integrity
- [ ] **Ambiguity Check**: When adding a `.select()` join (e.g., `profiles(...)`), check if the table has multiple foreign keys pointing to that relation.
- [ ] If multiple FKs exist, **MANDATORY** use explicit join syntax: `relation_name:table_name!column_name(...)`.
- [ ] **Schema Sync**: Verify that any new columns added in a migration are manually included in the `.select()` strings of the corresponding server actions.
## 3. UI/UX Consistency
- [ ] **Payee/Context Check**: If an entity (Vendor/Resident/Staff) is being displayed, ensure the code handles all possible "Payee" types to avoid blank columns.
- [ ] **Immediate Sync**: Verify that `create` or `update` actions return the same joined data as `get` actions so the UI updates instantly without a refresh.
- [ ] **State Sync**: If using local state in a page, ensure a `useEffect` is present to sync that state with fresh server props when `router.refresh()` is called.
## 4. Error Handling
- [ ] Ensure `console.error` blocks provide meaningful context and do not swallow specific database error objects.
- [ ] Verify that high-level pages have appropriate Error Boundaries or "No Data" states for the modified features.
