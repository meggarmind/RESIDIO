'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RolesList } from '@/components/admin/roles-list';
import { RoleAssignmentRulesEditor } from '@/components/admin/role-assignment-rules';
import { Shield, Settings, Loader2 } from 'lucide-react';

function RolesSettingsContent() {
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const validTabs = ['roles', 'rules'];
  const initialTab = tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : 'roles';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Roles & Permissions</h3>
        <p className="text-sm text-muted-foreground">
          Define admin roles and the rules governing who can be assigned each one.
        </p>
      </div>

      <Tabs key={initialTab} defaultValue={initialTab} className="space-y-4">
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

function LoadingFallback() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Roles & Permissions</h3>
        <p className="text-sm text-muted-foreground">
          Define admin roles and the rules governing who can be assigned each one.
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
