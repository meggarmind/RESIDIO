import { getMyWhatsAppAdminAccess } from '@/actions/whatsapp/admin-access';
import { getWhatsAppAdminSettings } from '@/actions/whatsapp/admin-settings';
import { SettingsPageHeader } from '@/components/settings/settings-page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminLinkControls } from '@/app/(dashboard)/settings/whatsapp-admin/admin-link-controls';
import { AdminsTable } from '@/app/(dashboard)/settings/whatsapp-admin/admins-table';
import { RoleGrid } from '@/app/(dashboard)/settings/whatsapp-admin/role-grid';
import {
  ADMIN_DAILY_ACTION_CAP,
  ADMIN_IDLE_DAYS,
  ADMIN_LOCK_MINUTES,
  ADMIN_MAX_WRONG_CODES,
  ADMIN_REVERIFY_DAYS,
  ADMIN_SESSION_MINUTES,
} from '@/lib/whatsapp/admin';

export default async function WhatsAppAdminAccessPage() {
  const [result, settings] = await Promise.all([getMyWhatsAppAdminAccess(), getWhatsAppAdminSettings()]);

  return (
    <div className="space-y-6">
      <SettingsPageHeader description="See which admins have a WhatsApp number linked, choose which Admin tools items each role sees, and set when a code is asked for." />
      <Card>
        <CardHeader>
          <CardTitle>Linked admins</CardTitle>
          <CardDescription>
            {settings.data?.canManage ? 'Every admin with a linked WhatsApp number.' : 'Your own linked WhatsApp number.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settings.success && settings.data
            ? <AdminsTable rows={settings.data.rows} candidates={settings.data.candidates} canManage={settings.data.canManage} viewerProfileId={settings.data.viewerProfileId} globalCodeRequired={settings.data.globalCodeRequired} />
            : <p className="text-sm text-destructive">{settings.error || 'Could not read the linked admins.'}</p>}
        </CardContent>
      </Card>
      {settings.data?.canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Role access</CardTitle>
            <CardDescription>Which roles see each Admin tools item in WhatsApp. This changes who can see resident data.</CardDescription>
          </CardHeader>
          <CardContent>
            <RoleGrid key={JSON.stringify(settings.data.roles)} roles={settings.data.roles} />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Link your own number</CardTitle>
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
            <li>Open Admin tools with 6 on the main menu, or send ADMIN, then enter your authenticator code when it is asked for.</li>
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
