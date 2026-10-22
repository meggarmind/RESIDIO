import { getMyWhatsAppAdminAccess } from '@/actions/whatsapp/admin-access';
import { SettingsPageHeader } from '@/components/settings/settings-page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminLinkControls } from '@/app/(dashboard)/settings/whatsapp-admin/admin-link-controls';
import {
  ADMIN_DAILY_ACTION_CAP,
  ADMIN_IDLE_DAYS,
  ADMIN_LOCK_MINUTES,
  ADMIN_MAX_WRONG_CODES,
  ADMIN_REVERIFY_DAYS,
  ADMIN_SESSION_MINUTES,
} from '@/lib/whatsapp/admin';

export default async function WhatsAppAdminAccessPage() {
  const result = await getMyWhatsAppAdminAccess();

  return (
    <div className="space-y-6">
      <SettingsPageHeader description="Link your own WhatsApp number to your admin account and approve each request with your authenticator app." />
      <Card>
        <CardHeader>
          <CardTitle>Your WhatsApp number</CardTitle>
          <CardDescription>
            Only a linked number can use admin mode. Each request needs a code from your authenticator app; one code opens a {ADMIN_SESSION_MINUTES}-minute session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {result.success && result.data
            ? <AdminLinkControls state={result.data} />
            : <p className="text-sm text-destructive">{result.error || 'Could not read your WhatsApp admin link.'}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Rules</CardTitle></CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>On WhatsApp, send ADMIN LINK followed by the link code from this page. The code works once, for 10 minutes.</li>
            <li>Send ADMIN STATUS, then ADMIN followed by your authenticator code to approve it.</li>
            <li>The link ends when your role, account or authenticator app changes, {ADMIN_REVERIFY_DAYS} days after linking, or after {ADMIN_IDLE_DAYS} days without use.</li>
            <li>{ADMIN_MAX_WRONG_CODES} wrong codes lock admin mode on the number for {ADMIN_LOCK_MINUTES} minutes. You get an email after each lock and each new link.</li>
            <li>At most {ADMIN_DAILY_ACTION_CAP} admin requests a day.</li>
            <li>Keep your authenticator app on a different device from WhatsApp, or behind a screen lock.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
