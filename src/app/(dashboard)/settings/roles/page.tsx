'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RolesList } from '@/components/admin/roles-list';
import { RoleAssignmentSection } from '@/components/admin/role-assignment-section';
import { RoleAssignmentRulesEditor } from '@/components/admin/role-assignment-rules';
import { Shield, Users, Settings } from 'lucide-react';

export default function RolesSettingsPage() {
  const [activeTab, setActiveTab] = useState('roles');

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Roles & Permissions</h3>
        <p className="text-sm text-muted-foreground">
          Manage admin roles, their permissions, and assign roles to residents.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="roles" className="gap-2">
            <Shield className="h-4 w-4" />
            Role Definitions
          </TabsTrigger>
          <TabsTrigger value="assignments" className="gap-2">
            <Users className="h-4 w-4" />
            Role Assignments
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

        <TabsContent value="assignments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Assign Roles to Residents</CardTitle>
              <CardDescription>
                Search for residents and assign administrative roles. Only the Super Administrator
                can assign the Chairman role. The Chairman and Super Administrator can assign other
                admin roles.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RoleAssignmentSection />
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
