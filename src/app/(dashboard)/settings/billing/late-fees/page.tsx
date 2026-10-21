import { redirect } from 'next/navigation';

// Merged into /settings/billing#late-fees (#935). The ROUTE_PERMISSIONS entry for this path stays: it still decides who reaches the redirect (ADR-0004).
export default function Page() {
  redirect('/settings/billing#late-fees');
}
