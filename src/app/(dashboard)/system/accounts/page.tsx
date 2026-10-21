import { redirect } from 'next/navigation';

// Moved to /settings/access (#939). Every query value passes through, so old and #912 ?tab= names
// keep working. The ROUTE_PERMISSIONS entry for this path stays: it still decides who reaches the redirect (ADR-0004).
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of [value ?? []].flat()) params.append(key, v);
  }
  const query = params.toString();
  redirect(query ? `/settings/access?${query}` : '/settings/access');
}
