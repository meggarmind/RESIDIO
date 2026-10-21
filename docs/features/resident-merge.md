# Merge residents: database contract

This page is the contract between the database half of **Merge residents** (#987, part of #821) and the
server action and screen that call it. It covers the `preview_resident_merge` and `merge_residents`
functions, their input and output JSON, the blockers, and what a merge does.

The SQL is in three migrations:

- `supabase/migrations/20261024100000_resident_merge_schema.sql`: the permission, `residents.merged_into_resident_id` and `resident_merges`.
- `supabase/migrations/20261024100100_resident_merge_functions.sql`: the two functions.
- `supabase/migrations/20261024100200_resident_merge_guard.sql`: an optional insert guard.

The owner's decisions of 21 October 2026 (Q1 to Q10) are recorded on #987. They are settled.

## Who can call

Only a holder of `residents.merge` (`PERMISSIONS.RESIDENTS_MERGE`) can call either function. Migration A
grants it to `super_admin` only (Q1).

- **No service-role bypass.** Each function checks `has_permission('residents.merge')` against
  `auth.uid()`. Call it with the signed-in admin's session client, not `createAdminClient()`: the
  service role has no `auth.uid()` and is refused.
- **Check in the action too.** The server action must still call
  `authorizePermission(PERMISSIONS.RESIDENTS_MERGE)` first (CORE.md section 6).
- `anon` has no EXECUTE on either function.
- The helper functions `resident_merge_plan`, `resident_merge_money` and `resident_merge_references`
  cannot be called through the API.

```ts
const { data, error } = await supabase.rpc('preview_resident_merge', { p_kept, p_duplicate });
const { data, error } = await supabase.rpc('merge_residents', { p_kept, p_duplicate, p_contact_choices });
```

`src/types/database.generated.ts` lists neither function until the migrations are applied and
`npm run db:types` is run.

## Errors

| SQLSTATE | Message starts with | Raised by | Meaning |
|---|---|---|---|
| `42501` | `Not authorized to merge residents` | both | The caller lacks `residents.merge` |
| `22023` | `Both resident ids are required` | both | `p_kept` or `p_duplicate` is null |
| `22023` | `contact_choices must be a JSON object` / `Invalid contact choice` | merge | A bad `p_contact_choices` value (see below) |
| `P0001` | `Resident merge blocked: <codes>` | merge | The preview has blockers. `DETAIL` holds the blockers array as JSON text |
| `P0001` | `Resident merge invariant failed: ...` | merge | A safety check failed. Nothing was changed. Report this as a defect |
| other | from an existing trigger or constraint | merge | For example, the sponsor rule on a domestic-staff link. Nothing was changed |

A merge either finishes completely or changes nothing.

## `preview_resident_merge(p_kept uuid, p_duplicate uuid) → jsonb`

Read-only. `p_kept` is the record that survives. `p_duplicate` is archived by the merge.

When either record is missing, or the two ids are equal, the preview returns only the ids,
`can_merge: false` and a single blocker (`not_found` or `self_merge`). Otherwise it returns:

```jsonc
{
  "kept_resident_id": "uuid",
  "duplicate_resident_id": "uuid",
  "can_merge": true,                       // blockers is empty
  "blockers": [ { "code": "same_house", "message": "…", "detail": { "house_ids": ["uuid"] } } ],
  "warnings": {
    // Same amount and payment date, and the same reference or no reference on one side.
    // Possibly one payment entered on both records. The admin voids one before merging; the merge does not decide.
    "possible_duplicate_payments": [ { "kept_payment_id": "uuid", "duplicate_payment_id": "uuid", "amount": 400.00, "payment_date": "2026-10-01" } ],
    // Non-void invoices for the same house over overlapping periods: possibly billed twice.
    "overlapping_invoices": [ { "kept_invoice_id": "uuid", "duplicate_invoice_id": "uuid", "house_id": "uuid" } ]
  },                                       // each list holds at most 50 entries
  "kept":      { "id": "uuid", "resident_code": "123456", "name": "…", "entity_type": "individual", "account_status": "active", "has_login": true,  "has_whatsapp_pin": false },
  "duplicate": { "id": "uuid", "resident_code": "654321", "name": "…", "entity_type": "individual", "account_status": "active", "has_login": false, "has_whatsapp_pin": true },
  "contact": {
    "kept":      { "email": "…", "email_verified_at": null, "phone_primary": "…", "phone_verified_at": null, "phone_secondary": null },
    "duplicate": { "email": "…", "email_verified_at": null, "phone_primary": "…", "phone_verified_at": null, "phone_secondary": null },
    // Q2: offer the duplicate's phone as the kept record's second phone, so WhatsApp still knows that number.
    "suggest_duplicate_phone_as_secondary": true
  },
  "counts": { "payment_records.resident_id": 2, "invoices.resident_id": 2, "…": 0 },
  "folds":  { "whatsapp_optins.resident_id": 1, "…": 0 },
  "replaced_kept_rows": { "resident_houses": 0 },
  "wallets": { "kept_balance": 50.00, "duplicate_balance": 250.00, "combined_balance": 300.00, "duplicate_has_wallet": true },
  "account_balances": { "kept_closing_balance": -50.00, "duplicate_closing_balance": 50.00, "combined_closing_balance": 0.00 }
}
```

Field notes:

- `counts` has one key per `table.column` that references a resident, plus five more:
  `entity_notes.entity_id`, `approval_requests.entity_id`, `in_app_notifications.entity_id`,
  `escalation_states.entity_id` and `wallet_transactions.wallet_id`. Each value is the number of the
  duplicate's rows. Every row moves, or is dropped (see `folds`).
- `folds` uses the same keys. Each value is the number of the duplicate's rows that are dropped
  because the kept record already has the same row. Every dropped row is copied in full into the
  snapshot. The folding rules are below.
- `replaced_kept_rows.resident_houses` counts the kept record's **ended** house links that are
  replaced by the duplicate's **active** link to the same house.
- `account_balances` come from `resident_account_balance(…, NULL, 1900-01-01, 2999-12-31)` over all
  properties. A positive balance means owed, a negative one means credit. After a merge, the kept
  record's closing balance equals `combined_closing_balance`.

### Blockers

| `code` | `detail` | Stop because | What the admin does |
|---|---|---|---|
| `not_found` | `{kept_found, duplicate_found}` | An id does not exist | Pick again |
| `self_merge` | null | Same record twice | Pick again |
| `already_merged` | `{kept_merged_into, duplicate_merged_into}` | One record was merged before | Merge into the surviving record |
| `kept_archived` | null | The record to keep is archived | Keep the live record |
| `same_house` | `{house_ids}` | Both have an **active** link to one house (Q3) | End one link with the move-out or unassign tools, then merge |
| `house_link_in_use` | `{resident_house_ids}` | The Q3 fold would drop an ended house link that a personnel engagement still uses | Move or end the engagement |
| `both_logins` | null | Both have a portal login (Q4) | Unlink one login |
| `invoice_clash` | `{pairs: [{kept_invoice_id, duplicate_invoice_id}]}` | Both were invoiced for the same house, billing profile (or version) and period | Void one invoice of each pair |
| `generation_run_open` | `{run_ids}` | An open invoice generation run includes either record | Finish or cancel the run |
| `generation_candidate_clash` | `{pairs: [{kept_candidate_id, duplicate_candidate_id}]}` | One run billed both for the same house and period | Resolve the run's candidates |
| `unhandled_reference` | `{references: [{reference, rows}]}` | A table added after this function holds the duplicate's rows | A developer updates `resident_merge_references()` |

## `merge_residents(p_kept uuid, p_duplicate uuid, p_contact_choices jsonb DEFAULT '{}') → jsonb`

### Input: `p_contact_choices`

This input carries the Q2 choices. Each key is optional. A missing key means `"kept"`. Any other key
or value is refused with `22023`.

```jsonc
{
  "email": "kept" | "duplicate",
  "phone_primary": "kept" | "duplicate",
  "phone_secondary": "kept" | "duplicate" | "duplicate_phone_primary"
}
```

- When a value comes from the duplicate, its `email_verified_at` or `phone_verified_at` comes with
  it. When the two values are equal, the later timestamp is kept.
- Every other `residents` column stays as on the kept record. This includes names, notes,
  `use_override_comms`, the portal flags and the WhatsApp PIN.
- The duplicate's archived row keeps its own values.

### Output

```jsonc
{
  "merge_id": "uuid",                        // resident_merges.id; put it in both audit entries
  "kept_resident_id": "uuid",
  "merged_resident_id": "uuid",
  "moved":  { "payment_records.resident_id": 2, "wallet_transactions.wallet_id": 2, "…": 0 },
  "folded": { "whatsapp_optins.resident_id": 1, "residents.emergency_contact_resident_id": 1, "…": 0 },
  "replaced_kept_rows": { "resident_houses": 0 },
  "contact": { "email": "kept", "phone_primary": "kept", "phone_secondary": "duplicate_phone_primary" },
  "wallet": { "combined": true, "kept_balance_before": 50.00, "duplicate_balance_before": 250.00, "kept_balance_after": 300.00 },
  "account_balance": { "kept_closing_before": -50.00, "duplicate_closing_before": 50.00, "kept_closing_after": 0.00 },
  "whatsapp_pin_cleared": true,              // the duplicate had a PIN; it is gone (Q5)
  "kept_has_whatsapp_pin": false             // when false and the duplicate had one, tell the admin the person must set a new PIN
}
```

For every key in the preview's `counts`, `moved` plus `folded` equals that count. The merge checks
this before it commits. `folded["residents.emergency_contact_resident_id"]` is 1 when the kept record
named the duplicate as its own emergency contact; that pointer is cleared.

### What a merge does, in order

1. Locks both `residents` rows, then both wallets, in ascending id order. It re-runs the preview
   inside the locks and raises on any blocker.
2. Writes the Q2 contact choices to the kept record.
3. Folds the tables that allow one row per resident. The kept record's row wins, and the
   duplicate's row goes into the snapshot:
   - payer aliases with the same text;
   - notification preferences with the same category and channel;
   - escalation states for the same entity;
   - resident-level settings with the same key;
   - report subscriptions;
   - group memberships for the same group;
   - clearance copies for the same document;
   - survey opt-outs: an opt-out on either record means opted out.

   The cadence cache row of the duplicate is dropped; the nightly cron recomputes it.

   Some tables have their own rules:
   - **Read receipts:** the kept row keeps the earlier read time.
   - **House links on the same house (Q3):** both active is a blocker. If one link is ended, the
     active link stays and the ended one is dropped. If both are ended, the kept record's link stays.
   - **WhatsApp opt-ins for the same phone (Q7):** the later decision (`opted_in_at` or
     `opted_out_at`) is written onto the kept row. That row keeps `link_verified_at` if either row had
     it, and stays active if either row was.
4. Stops anything proven on the duplicate from carrying over (Q5):
   - its unused contact verification codes are expired;
   - its unused WhatsApp link and PIN-setup codes are expired;
   - its WhatsApp sessions lose PIN authentication.
5. Moves the wallet (Q6):
   - the duplicate's `wallet_transactions` are re-pointed to the kept wallet, which is created if
     it is missing;
   - the kept balance becomes kept + duplicate, and the duplicate's wallet stays with balance 0;
   - one **zero-amount** row with `reference_type = 'resident_merge'` and `reference_id = merge_id`
     is added on each side: "Merged in <name> (<code>): ₦X" and "Moved to <name> (<code>): ₦X";
   - the kept wallet's `balance_after` is recomputed in time order, so the latest row equals the
     balance.
6. Re-points every other referencing row to the kept record. This includes invoices, payments,
   Paystack, batches, waivers, bank and email import matches, expenses, links, documents,
   notifications, WhatsApp tables, approvals and notes. The login (`profiles.resident_id`) moves
   before the duplicate is archived (Q4), so `residents_remove_admin_roles` finds no profile on it.
7. Archives the duplicate:
   - sets `account_status = 'archived'` and `merged_into_resident_id = p_kept`;
   - clears its `profile_id`;
   - clears its WhatsApp PIN and lock state (Q5).

   WhatsApp matching reads only active and inactive residents, so the merged phone resolves to one
   resident.
8. Checks the invariants below and writes the `resident_merges` row.

### Invariants (any failure raises and rolls the merge back)

- The sum of both wallet balances is unchanged, and the duplicate's wallet balance is 0. There is
  one currency (₦); no table has a currency column.
- The signed sum of both records' `wallet_transactions` is unchanged. The explanation rows are zero.
- `resident_account_balance` closing and awaiting figures: the kept record's figure after the merge
  equals kept before plus duplicate before, and the duplicate's is 0. This is the check that proves
  nothing was counted twice or lost.
- Payment count and sum, and invoice count and sum of `amount_due`, are unchanged over the two
  records, and none are left on the duplicate.
- For every reference, rows moved plus rows folded equal the preview's count.
- No row references the duplicate in any foreign key to `residents`, or in a polymorphic reference.
  The foreign keys are read from `pg_constraint` at run time. Two things still point at the
  duplicate: its emptied wallet and the merge history.

## `resident_merges`

| Column | Notes |
|---|---|
| `id` | Equals `merge_id` |
| `kept_resident_id`, `merged_resident_id` | `merged_resident_id` is unique: a record is merged once. Both are ON DELETE RESTRICT |
| `merged_by` | `auth.uid()` of the caller |
| `merged_at` | Defaults to `now()` |
| `counts` | `{references, moved, folded, replaced_kept_rows}` |
| `snapshot` | The undo record (Q9), below |

Only holders of `residents.merge` can read it, through RLS. Only `merge_residents` writes it.

The snapshot is enough to reverse a merge by hand. There is no un-merge button.

```jsonc
{
  "version": 1,
  "contact_choices": { },
  "kept_before": { /* the kept residents row before the merge, without whatsapp_pin_hash */ },
  "duplicate_before": { /* the duplicate's row before the merge, without whatsapp_pin_hash */ },
  "moved":   { "payment_records.resident_id": ["<id>", "…"], "wallet_transactions.wallet_id": ["<id>"], "…": [] },
  "folded":  { "whatsapp_optins": [ { /* full dropped row */ } ], "resident_houses": [ ], "…": [] },
  "updated": {
    "whatsapp_optins": [ { /* the kept row before the Q7 decision was written */ } ],
    "announcement_read_receipts": [ { /* the kept row before its read time changed */ } ],
    "verification_tokens": [ { "id": "…", "expires_at": "…" } ],
    "whatsapp_link_tokens": [ { "id": "…", "purpose": "pin_setup", "expires_at": "…" } ],
    "whatsapp_sessions": [ { "id": "…", "pin_authenticated": true, "had_pending_pin": false } ],
    "residents.emergency_contact_resident_id": [ { "id": "<kept>", "emergency_contact_resident_id": "<duplicate>" } ]
  },
  "wallets": {
    "combined": true,
    "kept_before": { /* wallet row, or null when the kept wallet was created */ },
    "duplicate_before": { /* wallet row */ },
    "kept_wallet_created": false,
    "kept_wallet_id": "uuid", "duplicate_wallet_id": "uuid", "kept_balance_after": 300.00,
    "old_balance_after": { "<wallet_transaction id>": 250.00 }
  }
}
```

The snapshot leaves out PIN hashes and one-time code values on purpose. The person sets a new PIN, and
the old codes are expired.

## Insert guard (migration C, optional)

A `BEFORE INSERT` trigger refuses new rows that point at a merged resident (`23503`, "Resident … was
merged into resident …; write to that record instead"). It covers `payment_records`, `invoices`,
`resident_houses` and `wallet_transactions`, the last through the wallet's resident.

It locks the resident row `FOR KEY SHARE`, so an insert that races a merge waits for the merge and is
then refused. A concurrent wallet write and a merge can deadlock instead. PostgreSQL aborts one of
them, which changes nothing, and the caller retries.

## For the action and screen issue

- Call the preview first and show `blockers`, `warnings`, `counts`, `wallets`, `account_balances` and
  `contact`. Disable the merge while `can_merge` is false.
- Confirm by typing the duplicate's resident code (Q10).
- After success, write two `logAudit` entries, both `UPDATE`, each carrying `merge_id`:
  - on the kept resident, with `moved` and `folded`;
  - on the archived resident, with `account_status` going to `archived` and the pointer.

  Audit entity type `resident_merges` exists for a row about the merge itself.
- On an archived record, show "Merged into <code>" when `merged_into_resident_id` is set.
- Verification: `docs/security/probe-821-merge.sql` runs every check above on Residio_Stage inside a
  rolled-back transaction.
