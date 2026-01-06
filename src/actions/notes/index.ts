/**
 * Notes Module Server Actions
 *
 * Provides CRUD operations for entity notes (Residents and Houses).
 * Features:
 * - Polymorphic notes attached to residents or houses
 * - Version history with soft-edit
 * - Optional document attachment
 * - Category-based organization
 * - Role-based confidentiality
 */

// Create
export { createNote } from './create-note';

// Read
export { getNotes, getNote, getNoteStats, searchNotes } from './get-notes';

// Update (creates new version)
export { updateNote } from './update-note';

// Delete
export { deleteNote, deleteNoteVersion } from './delete-note';

// Version History
export {
  getNoteHistory,
  compareNoteVersions,
  restoreNoteVersion,
} from './get-note-history';
