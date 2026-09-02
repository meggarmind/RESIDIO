'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RolesList } from '@/components/admin/roles-list';
import { RoleAssignmentSection } from '@/components/admin/role-assignment-section';
import { RoleAssignmentRulesEditor } from '@/components/admin/role-assignment-rules';
import { OrphanedAccountsList } from '@/components/admin/orphaned-accounts-list';
import { CurrentAdminsList } from '@/components/admin/current-admins-list';
import { PendingAccountsList } from '@/components/admin/pending-accounts-list';
import { Shield, Users, Settings, Ghost, UserCheck, Loader2 } from 'lucide-react';

function RolesSettingsContent() {
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const validTabs = ['roles', 'assignments', 'pending', 'rules', 'orphaned'];
  const initialTab = tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : 'roles';

  const [activeTab, setActiveTab] = useState(initialTab);

  // Sync tab state with URL parameter changes
  useEffect(() => {
    if (tabFromUrl && validTabs.includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Roles & Permissions</h3>
        <p className="text-sm text-muted-foreground">
          Manage admin roles, their permissions, and assign roles to residents.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="roles" className="gap-2">
            <Shield className="h-4 w-4" />
            Role Definitions
          </TabsTrigger>
          <TabsTrigger value="assignments" className="gap-2">
            <Users className="h-4 w-4" />
            Role Assignments
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-2">
            <UserCheck className="h-4 w-4" />
            Pending Accounts
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-2">
            <Settings className="h-4 w-4" />
            Assignment Rules
          </TabsTrigger>
          <TabsTrigger value="orphaned" className="gap-2">
            <Ghost className="h-4 w-4" />
            Orphaned Accounts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Role Management</CardTitle>
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

        <TabsContent value="assignments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Current Administrators</CardTitle>
              <CardDescription>
                Everyone currently assigned to an administrative role, whether or not they
                live on the estate.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CurrentAdminsList />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assign Roles</CardTitle>
              <CardDescription>
                Search residents, or search accounts to reach staff who have a login but no
                resident record. Role assignment is part of the Settings module, so it sits
                with the Super Administrator.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RoleAssignmentSection />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending Accounts</CardTitle>
              <CardDescription>
                People who have signed up and are waiting to be let in. Until you approve one,
                the account can sign in but has no access to any estate data. Approving it
                assigns the role it will hold.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PendingAccountsList />
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

        <TabsContent value="orphaned" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Orphaned Auth Accounts</CardTitle>
              <CardDescription>
                Auth accounts that exist in Supabase but are not linked to any resident.
                These may be from failed registrations or account migrations. Link them to
                existing residents to enable portal access.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OrphanedAccountsList />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Roles & Permissions</h3>
        <p className="text-sm text-muted-foreground">
          Manage admin roles, their permissions, and assign roles to residents.
        </p>
      </div>
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
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
