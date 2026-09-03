import { redirect } from 'next/navigation';

/**
 * Redirect from the deprecated "Import Configuration" sub-page into its
 * merged parent.
 *
 * `/settings/email-integration` and `/settings/email-integration/config`
 * rendered the same Gmail connection card; despite the nav describing this
 * page as "Email import rules", it configured no rule at all. The two were
 * merged (#178) with the richer markup from this page kept as the base.
 *
 * This permanent redirect ensures bookmarks and external links continue to
 * work. `ROUTE_PERMISSIONS['/settings/email-integration/config']` is kept in
 * `action-roles.ts` even though this is now a stub: it is a page component
 * and runs after middleware, so that entry is what gates who reaches it —
 * deleting it would widen access to the generic /settings fallback.
 */
export default function EmailIntegrationConfigRedirect() {
  redirect('/settings/email-integration');
}
