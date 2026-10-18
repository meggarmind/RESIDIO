---
id: documents-and-personnel
title: Documents and personnel
sidebar_label: Documents and personnel
residio_sources:
  - src/app/(dashboard)/documents/**
  - src/app/(dashboard)/personnel/**
  - src/actions/documents/**
  - src/actions/personnel/**
residio_verified_commit: b052a314
residio_verified_at: '2026-10-18'
residio_app_version: '0.4.0'
---

# Documents and personnel

## Documents

Use **Documents** to upload, categorize, and retrieve estate records. Choose a clear category, title, and access scope. Check the detail page after upload to confirm the file is available to the intended audience.

Search matches whole words in a document's title, description and file name, and lists title matches first, then description, then file name. A search can use quotes for an exact phrase and `-word` to exclude a word. If no whole word matches, search falls back to matching part of the text, so a fragment such as `inv` still finds "Invoice register".

**Tags.** Tags add finer distinctions than categories, and a document can carry several. Pick tags in the upload form, or change them in the *Tags & Fields* card on the document's detail page (needs the document update permission). Tags nest up to five levels deep, for example *Finance / Invoices / 2026*. The library's tag filter matches a tag and every tag nested under it, so filtering by *Finance* also lists documents tagged *Invoices*. Each document row shows its tags under its category.

**Custom fields.** Custom fields record structured details on a document: text, a number, a date, money, yes or no, a link, or a link to another document. Fill them in the *Tags & Fields* card on the detail page. Each value must match its field's type. Tags and field values belong to the document as a whole, so uploading a new version keeps them.

Tags and custom fields are defined under **Settings → Document Tags & Fields**, which needs the *Manage Tags* or *Manage Custom Fields* permission. Deactivating a tag or field hides it without removing it from documents, and reactivating it brings it back. A field's type cannot be changed after it is created.

## Contractors and staff

Use **Contractors & Staff** to maintain operational personnel and their accountability scope. Keep engagement dates and responsibility descriptions current. End an engagement rather than deleting history when a person leaves the assignment.

:::warning[Documents are records]
Do not upload passwords, private keys, raw access tokens, or unrelated personal documents. Store sensitive infrastructure secrets outside the dashboard.
:::
