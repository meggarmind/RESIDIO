---
id: houses-and-occupancy
title: Houses and occupancy
sidebar_label: Houses and occupancy
description: Manage the estate property registry and occupancy state.
residio_sources:
  - src/app/(dashboard)/houses/**
  - src/actions/houses/**
residio_verified_commit: 93ed5d0
residio_verified_at: '2026-08-29'
residio_app_version: '0.4.0'
---

# Houses and occupancy

Open **Houses** to inspect the property registry, current occupancy, street, house type, and linked residents.

![Residio houses directory](../assets/admin/houses-directory.png)

## Find a property

1. Search by house label or short name.
2. Filter by street, house type, occupancy, or active status.
3. Open the property to review current residents and ownership history.

## Occupancy is not a manual label

Occupancy is derived from active resident-house assignments. If the displayed state is unexpected, inspect the assignment history and active roles before editing the house itself.

## Add a house

Use **Add House** for a new property. Select the correct street and house type, enter the estate display label, review the details, and save. Do not reuse an existing label.

## Identifiers that need confirmation

Some properties came from the estate's manual register, where a `?` marks a character the
recorder was not sure of — `IBB-3?F?`, for example. Residio keeps the identifier exactly as it
was recorded and tracks the doubt separately, so the register stays faithful and nothing that
already references the property breaks.

- A property whose identifier is doubted carries a **Needs confirmation** badge on the houses
  list and on its own page. Hover the badge to read what is uncertain.
- The **Identifier** filter on the houses list narrows to *Needs confirmation* or *Confirmed*.
- **Unconfirmed** opens the work queue at `/houses/unverified`: every property still awaiting
  confirmation, with the note recorded against each one.

Confirming an identifier records that the value is right as recorded and removes the property
from the queue. It does not change the identifier — if the value itself is wrong, edit the
house instead. Confirming requires the *update houses* permission; without it the queue is
still readable, but the confirm button is not shown.

When adding or editing a house, tick **Identifier needs confirmation** and describe what is
uncertain if you are recording a house number you could not verify.
