export type RoleMembership = { resident_id: string; role: string };
export type RoleGroup = { slug: string; name: string; roles: string[] };

export type ResidentRoleCounts = {
  roles: { role: string; count: number }[];
  groups: { slug: string; name: string; roles: string[]; count: number }[];
};

/**
 * The view has one row for each resident and role, so a role's count is its row count. A group
 * counts each resident once, even when they hold two of its roles. Never add the role counts:
 * a person with several roles is in each of them.
 */
export function countResidentRoles(memberships: RoleMembership[], groups: RoleGroup[]): ResidentRoleCounts {
  const byRole = new Map<string, Set<string>>();
  for (const m of memberships) {
    if (!byRole.has(m.role)) byRole.set(m.role, new Set());
    byRole.get(m.role)!.add(m.resident_id);
  }

  return {
    roles: [...byRole].map(([role, ids]) => ({ role, count: ids.size })).sort((a, b) => a.role.localeCompare(b.role)),
    groups: groups.map((g) => ({
      ...g,
      count: new Set(g.roles.flatMap((role) => [...(byRole.get(role) ?? [])])).size,
    })),
  };
}
