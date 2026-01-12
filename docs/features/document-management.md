# Document Management

Residio includes a robust document management system for storing, categorizing, and sharing estate-related documents with residents.

## Infrastructure

- **Storage**: Documents are stored in a dedicated Supabase Storage bucket with a 50MB per-file limit.
- **Allowed Types**: Common document formats (PDF, DOCX, XLSX, Images).
- **Security**: Access is controlled via Row-Level Security (RLS) and RBAC permissions.

## Key Features

### Categories
Documents are organized into categories (e.g., Minutes of Meetings, Bye-laws, Financial Reports). 
- Admins can manage categories and set visibility rules.
- Some categories can be marked as "Internal Only" (Admins/Staff) while others are "Public" (Residents).

### Access Control & Logging
- **Resident Portal**: Residents can view and download documents they are permitted to see via `/portal/documents`.
- **Audit Logs**: Every document upload, update, delete, and download is logged in the `document_access_logs` table.

### Version History
The system supports document versioning. When a document is updated, the previous version is preserved and linked to the new one, allowing for a complete audit trail of document changes.

## Permissions

Granular permissions control document actions:
- `documents.view`: View the document library.
- `documents.upload`: Upload new documents.
- `documents.update`: Edit document metadata or replace files.
- `documents.delete`: Remove documents.
- `documents.manage_categories`: Create and edit document categories.
