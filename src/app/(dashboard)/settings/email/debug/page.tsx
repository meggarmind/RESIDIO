import { redirect } from 'next/navigation';

/**
 * The email-only debug page was replaced by Debug Mode on the Communications
 * override page (#717). The route stays so bookmarks keep working.
 */
export default function EmailDebugRedirectPage() {
  redirect('/settings/comms-override#debug-mode');
}
