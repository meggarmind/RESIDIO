# Entity Notes Module

**Last Updated**: 2026-01-13
**Status**: Implemented (Database Layer)
**Related**: [Database Schema](../architecture/database-schema.md) | [Document Management](document-management.md)

---

## Overview

The Entity Notes module provides a flexible, polymorphic system for attaching rich notes to key system entities (Residents and Houses). It supports confidentiality levels, categorization, document attachments, and version history.

## Core Concepts

### 1. Polymorphism

Notes are not tied to a single table. The `entity_notes` table uses a polymorphic relationship:

- `entity_type`: Enum (`resident`, `house`)
- `entity_id`: UUID of the target entity

This allows the same notes system to serve Resident CRM-style logging and Property maintenance logging simultaneously.

### 2. Confidentiality & Security

Notes have a dedicated security model to protect sensitive information.

- **Standard Notes**: Visible to anyone with `notes.view` permission.
- **Confidential Notes**: (`is_confidential = true`)
  - Only visible to users with `notes.view_confidential` global permission.
  - OR users whose specific role is listed in the `confidential_roles` array (e.g., `['chairman', 'legal_officer']`).

### 3. Versioning

Notes support "Soft Edits". When a note is updated:

1. The new content is saved.
2. The `version` number increments.
3. The previous version can be kept (implementation dependent / future scope for full history UI).
4. `parent_note_id` links versions together.

### 4. Categorization

Notes are organized by `note_category`:

- `general`
- `agreement` (e.g., tenancy agreements)
- `complaint`
- `reminder`
- `financial`
- `security` (e.g., incident reports)
- `maintenance`
- `legal`

## Integration

### Documents

Notes can define a `document_id`, linking directly to the Document Management system. This allows a note to serve as the context or discussion wrapper around a file upload (e.g., a scanned tenancy agreement).

## Database Schema

**Table**: `entity_notes`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `entity_type` | enum | `resident` or `house` |
| `entity_id` | UUID | Target FK |
| `content` | text | The note body |
| `is_confidential` | bool | Security flag |
| `confidential_roles` | text[] | Allow-list for roles |
| `document_id` | UUID | Optional attachment |

## RBAC Permissions

The module uses specific permissions:

- `notes.view`: Base read access.
- `notes.view_confidential`: View sensitive notes.
- `notes.create`: Add new notes.
- `notes.update`: Edit existing notes.
- `notes.delete`: Remove notes.
