# Personas and tasks

The seven built-in admin roles and the three tasks each must finish without help. An audit uses
these as scenarios: for the page under review, pick the roles that use it and check that each can
finish its task there (`audit-checklist.md`, section "Task scenarios").

Role names are the `app_roles.name` values that `docs/validation/role-access-matrix.md` probes.
Permissions, not role names, gate controls (`CORE.md` §6). Task lists were confirmed by the owner
on 2026-10-24 (#1145). Change them only with an owner decision.

## Shared context

- Volunteer committee officers of an estate association. Not trained operators. Open the
  dashboard occasionally, often on a phone, and must trust the numbers (`PRODUCT.md`).
- Domain terms are fixed in `CONTEXT.md`: Resident, Co-resident, House, Levy, Invoice, Payment,
  Wallet. Use them as written in every label.

## chairman and vice_chairman

Oversight. Reads more than writes.

| # | Task | Starts at | Done when |
| --- | --- | --- | --- |
| C1 | See what needs attention today | Dashboard home | Pending approvals, unmatched payments and overdue levies are visible without scrolling on desktop and within one scroll on a phone |
| C2 | Approve or reject a pending item | Approvals | The item leaves the pending list and the decision is confirmed on screen |
| C3 | Read the financial position for a period | Reports > Financial Overview | Income, expenditure and balance for the chosen period are on one screen |

## financial_secretary and financial_officer

The heaviest users. Live in lists and imports.

| # | Task | Starts at | Done when |
| --- | --- | --- | --- |
| F1 | Import a bank statement and match payments to residents | Transactions > Import Statement | Every row is matched, flagged or skipped, and the summary states how many of each |
| F2 | Generate invoices for a levy period | Invoices & Dues > Generate Invoices | The preview states the count and total before the run, and the result states what was created |
| F3 | Find a resident's debt and payment history | Residents, then the record | Outstanding balance, last payment and the invoice list are on the record without opening another page |

## secretary

Keeps the roster and the notices.

| # | Task | Starts at | Done when |
| --- | --- | --- | --- |
| S1 | Add or edit a resident and link them to a house | Residents | The record shows the house and the co-residents, and the audit trail shows the change |
| S2 | Publish an announcement | Announcements | The announcement is listed as published with its audience and date |
| S3 | Upload a document for the estate | Documents | The document is listed with its category and is downloadable |

## security_officer

At the gate. Phone first.

| # | Task | Starts at | Done when |
| --- | --- | --- | --- |
| G1 | Look up a house or resident at the gate | Global search (`Cmd/Ctrl+K`) or Houses | House number, resident name and status are visible within two taps on a phone |
| G2 | Manage security contacts | Security | A contact can be added, edited and deactivated, and the list shows active status |
| G3 | Review the security page | Security | Current contacts and recent security notes are on one screen |

## super_admin

Everything above, plus the system.

| # | Task | Starts at | Done when |
| --- | --- | --- | --- |
| A1 | Change an estate setting and confirm it took | Settings | The saved value is shown after save and the audit log records it |
| A2 | Manage accounts and roles | Settings > `Roles & Access` (`/settings/access`) | A user's role is visible and changeable, and the change is audited |
| A3 | Check that background jobs ran | System > Cron Status, Notification Queue | Last run time and failures are visible; a failed item can be retried or inspected |

## How to use in an audit

1. Identify the archetype of the page (`page-patterns.md`) and the roles that own tasks starting
   there.
2. For each such task, walk it on desktop and at 375 px as that role's test user. Role test users exist as
   `admin@`, `chairman@`, `finance@` and `security@residio.test` (seeded by `scripts/seed-users.mjs`, listed in `e2e/fixtures.ts`); the
   password for `admin@residio.test` is in `CORE.md` §4.
3. A task that cannot be finished is a `blocker`. A task finished with a workaround is a `major`.
   Record the task id (for example `F1`) in the finding.
