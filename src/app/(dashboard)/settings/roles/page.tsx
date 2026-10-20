import { redirect } from 'next/navigation';

/**
 * Roles & Permissions moved into the single Roles & Access page (#912, ADR-0004
 * amendment). The old ROUTE_PERMISSIONS key stays: this redirect runs after
 * middleware, so deleting it would widen who reaches the path.
 */
export default async function RolesSettingsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  redirect(`/system/accounts?tab=${tab === 'rules' ? 'rules' : 'roles'}`);
}
