/**
 * Debug Mode duration limits (#717). Pure constants and checks with NO imports,
 * so client components and the settings validators can use them without pulling
 * in the server-only settings service (`next/headers`).
 */
export const DEBUG_DURATION_MIN = 5;
export const DEBUG_DURATION_MAX = 480;
export const DEBUG_DURATION_DEFAULT = 60;

export function isValidDebugDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= DEBUG_DURATION_MIN && value <= DEBUG_DURATION_MAX;
}
