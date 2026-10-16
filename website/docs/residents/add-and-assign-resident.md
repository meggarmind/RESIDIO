---
id: add-and-assign-resident
title: Add and assign a resident
sidebar_label: Add and assign a resident
residio_sources:
  - src/app/(dashboard)/residents/new/**
  - src/actions/residents/create-resident.ts
  - src/actions/residents/assign-house.ts
  - src/actions/residents/add-household-member.ts
residio_verified_commit: bafdbd8
residio_verified_at: '2026-10-16'
residio_app_version: '0.4.0'
---

# Add and assign a resident

Use this workflow when a new resident needs an account and a property assignment.

![Residio add resident form](../assets/admin/resident-create.png)

## Before you begin

- Confirm the person does not already exist in **Residents**.
- Confirm the house and the intended resident role.
- Have a reliable phone number or email for future verification.

## Create the record

1. Open **Residents → Add Resident**.
2. Enter the identity and contact details.
3. Select the resident type and occupancy role.
4. Add the house assignment when the form provides it, or save and assign it from the resident detail page.
5. If you hold the `settings.manage_general` permission, choose how the resident's messages are handled under **Communications override** (see below). Everyone else does not see this control.
6. Review the summary carefully, then select **Create resident**.
7. Record the generated resident code in the approved estate process.

### Communications override

This control decides whether email, SMS and WhatsApp messages for this resident are redirected to the override contacts set in the communications override settings.

- **Follow environment default** (the default): messages are redirected everywhere except production, where they go to the real recipient.
- **Use override contacts**: messages for this resident are always redirected while the override applies.
- **Send to real recipient**: messages go to the resident even outside production, for example from Stage. Use this only for a tester who should receive real messages. Debug Mode still redirects.

Users without the `settings.manage_general` permission cannot see or change this control, and a change they attempt through any other route is refused. Changes appear in **Audit Logs**.

:::warning[Duplicate prevention]
Do not create a second record because a resident has changed phone number, role, or house. Update the existing record instead.
:::

## After creation

Open the new resident profile and confirm the house, role, active status, and financial standing. The create event should appear in **Audit Logs**.
