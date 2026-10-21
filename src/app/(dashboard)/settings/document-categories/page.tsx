import { redirect } from 'next/navigation';

// Merged into /settings/documents (#937). The ROUTE_PERMISSIONS entry for this path stays: it still decides who reaches the redirect (ADR-0004).
export default function Page() {
  redirect('/settings/documents#categories');
}
