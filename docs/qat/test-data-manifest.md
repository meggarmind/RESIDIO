# QAT — Test Data Manifest

Every record created during the 2026-08-29 QA campaign, for later pruning. All records carry the `QAT-20260829` marker in a human-readable field.

**No pre-existing record was deleted, archived, or modified at any point during this campaign.**

| # | Entity | Identifier | Key values | Created by | Status |
|---|---|---|---|---|---|
| 1 | Resident | `resident_code` **177754** | First name `QAT`, last name `Tester-20260829-01`, phone `08012345678`, email `bad-emailqat.tester01@residio.test`, status Active, house Unassigned | QAT-RES-09 | Live |
| 2 | House | `QAT-01` — UUID `a6a5f7df-9cfb-485e-8219-d1d00084d4c9` | Street Kayode Oni Animashaun, 1 plot, no house type, Status Vacant, generated ID `KOA-QAT-05` | QAT-HSE-09 | Live |
| 3 | Security contact | `e6a510dd-246b-40d2-b4e1-0fc3b6bfa814` | `QAT-20260829 Visitor 01`, phone `08012345678`, category Visitor, resident QAT Tester-20260829-01 | QAT-SEC-07 → renamed for QAT-SEC-11 | Live |
| 4 | Security contact | id not captured | `ABB`, phone `+2348012345678`, category Visitor, resident QAT Tester-20260829-01 | QAT-SEC-07 side effect | Live |
| 5 | Access code | `RES-KS6-GSJT` | One-time code on contact #3; now used (`Uses: 1/1`, Inactive), window 8/29/2026–8/30/2026 | QAT-SEC-12 | Spent |
| 6 | Access log entry | — | Check-in 8/29/2026 22:13:08 for contact #3, status "Still inside" — **check-out never recorded** | QAT-SEC-19 | Open |

## Note on records 3 and 4 — two contacts where one was planned

Records 3 and 4 both exist because of defect QAT-SEC-D1. Case QAT-SEC-07 submitted two phone numbers that the documented Nigerian format rule should have rejected (`+1234567890` and `0912345678`); both were accepted, so each submission created a live contact. The test that demonstrates the validation gap is the test that leaves the residue.

Record 3 was then renamed and reused for the happy-path cases rather than creating a third contact.

Record 6 is an **open access-log entry** — a visitor checked in and never checked out. It will show as "Still inside" on `/security/logs` until someone closes it. Worth closing when pruning.

## Note on record 1

The email address is malformed-looking on purpose-adjacent grounds: case QAT-RES-07 deliberately entered `bad-email` to verify that the form rejects it (it did — "Invalid email address" was shown and submission was blocked). When correcting the field for the subsequent happy-path case, the clear-field keystrokes did not remove the existing text, so the corrected value was appended rather than replacing. The result, `bad-emailqat.tester01@residio.test`, is still a structurally valid email, so the form accepted it.

This is a **test-execution artifact, not an application defect** — the validator behaved correctly at every step. It is recorded here verbatim so the record is identifiable and so nobody later mistakes it for evidence of a validation bug.

## Records NOT created

Several planned records could not be created because their creation path is broken or was deliberately not exercised:

| Planned | Why not created |
|---|---|
| QAT payment record | `/payments/new` crashes before the form renders — see [#105](https://github.com/meggarmind/RESIDIO/issues/105). |
| QAT invoice / wallet transactions | Billing write operations deliberately deferred — see the billing report. |
| QAT billing profile, report schedule, personnel, project, expense | Modules not reached in this session. |

## Pruning

To locate the test data later:

```bash
gh issue list --repo meggarmind/RESIDIO --label bug --search "QA"
```

In the application, search the Residents module for `Tester-20260829` or filter by resident code `177754`. Archiving rather than hard-deleting is recommended, consistent with how `deleteResident` already behaves (it sets `account_status = 'archived'`).
