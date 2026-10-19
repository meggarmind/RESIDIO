'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RolesList } from '@/components/admin/roles-list';
import { RoleAssignmentRulesEditor } from '@/components/admin/role-assignment-rules';
import { Shield, Settings } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { SettingsSkeleton } from '@/components/settings/settings-states';

function RolesSettingsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { hasPermission } = useAuth();
  const tabFromUrl = searchParams.get('tab');
  const validTabs = ['roles', 'rules'];
  const tab = tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : 'roles';

  // The route also admits system.assign_roles, but every read and write on this page
  // enforces system.manage_roles server-side; assign-only admins work from Accounts.
  if (!hasPermission(PERMISSIONS.SYSTEM_MANAGE_ROLES)) {
    return (
      <div className="space-y-6">
        <RolesHeading />
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Defining roles needs the Manage roles permission. To give an account a role, use{' '}
            <Link href="/system/accounts" className="font-medium text-primary underline-offset-4 hover:underline">
              Accounts
            </Link>
            .
          </CardContent>
        </Card>
      </div>
    );
  }

  const onTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <RolesHeading />

      <Tabs value={tab} onValueChange={onTabChange} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="roles" className="gap-2">
            <Shield className="h-4 w-4" />
            Role Definitions
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-2">
            <Settings className="h-4 w-4" />
            Assignment Rules
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="space-y-4">
          <Card>
            <CardHeader>
              <CardDescription>
                Create, edit, or remove roles. System roles (Super Administrator, Resident)
                cannot be deleted but their permissions can be customized.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RolesList />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Role Assignment Rules</CardTitle>
              <CardDescription>
                Configure which resident types are allowed to be assigned each executive role.
                This helps enforce organizational policies about role eligibility.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RoleAssignmentRulesEditor />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RolesHeading() {
  return (
    <div>
      <h3 className="text-lg font-medium">Roles & Permissions</h3>
      <p className="text-sm text-muted-foreground">
        Define admin roles and the rules governing who can be assigned each one.
      </p>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="space-y-6">
      <RolesHeading />
      <SettingsSkeleton />
    </div>
  );
}

export default function RolesSettingsPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <RolesSettingsContent />
    </Suspense>
  );
}
