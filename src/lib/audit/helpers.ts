/**
 * Pure helper functions for audit logging.
 * These are NOT server actions - they are synchronous utility functions.
 */

/**
 * Helper to compute changed fields between old and new values.
 * Useful for UPDATE operations to determine what actually changed.
 *
 * @example
 * const changedFields = getChangedFields(oldResident, updatedResident);
 * // Returns: ['first_name', 'phone_primary'] if those fields changed
 */
export function getChangedFields(
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>
): string[] {
  const changedFields: string[] = [];

  for (const key of Object.keys(newValues)) {
    if (JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key])) {
      changedFields.push(key);
    }
  }

  return changedFields;
}

/**
 * Helper to create filtered objects containing only changed fields.
 * Useful for UPDATE operations to store only what changed in audit logs.
 *
 * @example
 * const changes = getChangedValues(oldResident, updatedResident);
 * await logAudit({
 *   action: 'UPDATE',
 *   entityType: 'residents',
 *   entityId: id,
 *   oldValues: changes.old,
 *   newValues: changes.new,
 * });
 */
export function getChangedValues(
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>
): { old: Record<string, unknown>; new: Record<string, unknown> } {
  const changedFields = getChangedFields(oldValues, newValues);

  const filteredOld: Record<string, unknown> = {};
  const filteredNew: Record<string, unknown> = {};

  for (const field of changedFields) {
    filteredOld[field] = oldValues[field];
    filteredNew[field] = newValues[field];
  }

  return { old: filteredOld, new: filteredNew };
}

/**
 * Helper to format a human-readable description of changes.
 *
 * @example
 * const description = formatChangeDescription(['first_name', 'email']);
 * // Returns: "Changed first_name, email"
 */
export function formatChangeDescription(changedFields: string[]): string {
  if (changedFields.length === 0) return 'No changes';
  return `Changed ${changedFields.join(', ')}`;
}
