import { redirect } from 'next/navigation';

/**
 * Redirect from the deprecated Settings System location.
 * Data retention (and the "Prune Data" trigger that runs its rule, per
 * ADR-0004) is genuine configuration and stays in Settings (#176) — it just
 * moved up a level so it no longer sits beside the new top-level /system
 * dashboard, which means something entirely different.
 *
 * This permanent redirect ensures bookmarks and external links continue to work.
 */
export default function SettingsSystemDataRedirect() {
  redirect('/settings/data-retention');
}
