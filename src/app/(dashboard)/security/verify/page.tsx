'use client';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScanLine, Loader2 } from 'lucide-react';
import { CodeVerification } from '@/components/security/code-verification';
import { useCurrentUserSecurityPermissions } from '@/hooks/use-security';

export default function VerificationPage() {
  const { data: permissionsData, isLoading } = useCurrentUserSecurityPermissions();

  const canVerifyCodes = permissionsData?.permissions?.verify_codes || false;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!canVerifyCodes) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ScanLine className="h-8 w-8" />
            Code Verification
          </h1>
          <p className="text-muted-foreground">
            Verify access codes and record visitor entry
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Permission Denied</CardTitle>
            <CardDescription>
              You do not have permission to verify access codes.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ScanLine className="h-8 w-8" />
          Code Verification
        </h1>
        <p className="text-muted-foreground">
          Verify access codes and record visitor entry
        </p>
      </div>

      <CodeVerification />
    </div>
  );
}
