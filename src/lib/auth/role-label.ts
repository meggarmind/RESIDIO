/** "Chairman · Vice Chairman" when the account has a title under its role, else just the role. */
export function roleWithTitle(
  roleDisplayName: string | null | undefined,
  titleName: string | null | undefined
): string {
  if (!roleDisplayName) return titleName ?? '';
  if (!titleName || titleName === roleDisplayName) return roleDisplayName;
  return `${roleDisplayName} · ${titleName}`;
}
