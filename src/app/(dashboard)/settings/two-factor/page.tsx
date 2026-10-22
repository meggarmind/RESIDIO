import { SettingsPageHeader } from '@/components/settings/settings-page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TwoFactorControls } from '@/app/(dashboard)/settings/two-factor/two-factor-controls';
import { TWO_FACTOR_LOCK_MINUTES, TWO_FACTOR_MAX_TRIES } from '@/lib/auth/two-factor-guard';

export default function TwoFactorPage() {
  return (
    <div className="space-y-6">
      <SettingsPageHeader />
      <Card>
        <CardHeader>
          <CardTitle>Authenticator app</CardTitle>
          <CardDescription>
            Your own account only. WhatsApp admin mode needs this turned on.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TwoFactorControls />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Rules</CardTitle></CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Each authenticator code works once.</li>
            <li>{TWO_FACTOR_MAX_TRIES} wrong codes lock code entry for {TWO_FACTOR_LOCK_MINUTES} minutes.</li>
            <li>Until you enter the code after signing in, your account has no admin access, in the app or in the database.</li>
            <li>Backup codes work once each. Making new ones or turning two-factor off needs a new code.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
