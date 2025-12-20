'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Shield,
  Users,
  ScanLine,
  ClipboardList,
  Plus,
  AlertTriangle,
  Clock,
  CheckCircle,
  Loader2,
  UserCheck,
  UserX,
} from 'lucide-react';
import Link from 'next/link';
import { SecurityContactsTable } from '@/components/security/security-contacts-table';
import { CodeVerification } from '@/components/security/code-verification';
import {
  useSecurityContacts,
  useTodayAccessLogs,
  useCurrentUserSecurityPermissions,
  useActiveContactCount,
  useExpiredContactCount,
  useExpiringContactCount,
} from '@/hooks/use-security';
import type { SecurityContactFilters } from '@/lib/validators/security-contact';

export default function SecurityPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [contactFilters, setContactFilters] = useState<SecurityContactFilters>({
    page: 1,
    limit: 10,
  });

  const { data: permissionsData, isLoading: permissionsLoading } = useCurrentUserSecurityPermissions();
  const { data: contactsData, isLoading: contactsLoading } = useSecurityContacts(contactFilters);
  const { data: todayLogs, isLoading: logsLoading } = useTodayAccessLogs();
  const { data: activeCount, isLoading: activeCountLoading } = useActiveContactCount();
  const { data: expiredCount, isLoading: expiredCountLoading } = useExpiredContactCount();
  const { data: expiringCount, isLoading: expiringCountLoading } = useExpiringContactCount(7);

  const canViewContacts = permissionsData?.permissions?.view_contacts || false;
  const canRegisterContacts = permissionsData?.permissions?.register_contacts || false;
  const canVerifyCodes = permissionsData?.permissions?.verify_codes || false;
  const canViewLogs = permissionsData?.permissions?.view_access_logs || false;

  // Use the accurate active count (excludes expired contacts)
  const activeContactsCount = activeCount ?? 0;
  const expiredContactsCount = expiredCount ?? 0;
  const expiringContactsCount = expiringCount ?? 0;
  const todayCheckIns = todayLogs?.filter(log => log.check_in_time)?.length || 0;
  const currentlyInside = todayLogs?.filter(log => log.check_in_time && !log.check_out_time)?.length || 0;
  const flaggedToday = todayLogs?.filter(log => log.flagged)?.length || 0;

  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Security
          </h1>
          <p className="text-muted-foreground">
            Manage access control, security contacts, and visitor verification.
          </p>
        </div>
        {canRegisterContacts && (
          <Button asChild>
            <Link href="/security/contacts/new">
              <Plus className="mr-2 h-4 w-4" />
              Register Contact
            </Link>
          </Button>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Contacts</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {activeCountLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : activeContactsCount}
            </div>
            <p className="text-xs text-muted-foreground">With valid access codes</p>
          </CardContent>
        </Card>

        {/* Expiring Soon Card */}
        <Card className={expiringContactsCount > 0 ? 'border-yellow-300 dark:border-yellow-700' : ''}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {expiringCountLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : expiringContactsCount > 0 ? (
                <span className="text-yellow-600">{expiringContactsCount}</span>
              ) : (
                <span className="text-muted-foreground">0</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Within 7 days</p>
          </CardContent>
        </Card>

        {/* Expired Card */}
        <Card className={expiredContactsCount > 0 ? 'border-red-300 dark:border-red-700' : ''}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expired</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {expiredCountLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : expiredContactsCount > 0 ? (
                <span className="text-red-600">{expiredContactsCount}</span>
              ) : (
                <span className="text-muted-foreground">0</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">No valid codes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Check-ins</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {logsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : todayCheckIns}
            </div>
            <p className="text-xs text-muted-foreground">Visitors checked in today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Currently Inside</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {logsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : currentlyInside}
            </div>
            <p className="text-xs text-muted-foreground">Not yet checked out</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Flagged Today</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {logsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : flaggedToday > 0 ? (
                <span className="text-destructive">{flaggedToday}</span>
              ) : (
                <span className="text-green-600">0</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Suspicious activity reports</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Overview
          </TabsTrigger>
          {canVerifyCodes && (
            <TabsTrigger value="verify" className="flex items-center gap-2">
              <ScanLine className="h-4 w-4" />
              Verify Code
            </TabsTrigger>
          )}
          {canViewContacts && (
            <TabsTrigger value="contacts" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Contacts
            </TabsTrigger>
          )}
          {canViewLogs && (
            <TabsTrigger value="logs" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Access Logs
            </TabsTrigger>
          )}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Quick Verification Card */}
            {canVerifyCodes && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ScanLine className="h-5 w-5" />
                    Quick Verification
                  </CardTitle>
                  <CardDescription>
                    Verify an access code for visitor entry
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Use the verification tab to scan or enter access codes and record check-ins.
                  </p>
                  <Button onClick={() => setActiveTab('verify')}>
                    <ScanLine className="mr-2 h-4 w-4" />
                    Open Verification
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Recent Activity Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" />
                  Recent Activity
                </CardTitle>
                <CardDescription>
                  Latest access events
                </CardDescription>
              </CardHeader>
              <CardContent>
                {logsLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : todayLogs && todayLogs.length > 0 ? (
                  <div className="space-y-2">
                    {todayLogs.slice(0, 5).map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between text-sm border-b pb-2 last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          {log.check_out_time ? (
                            <UserX className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <UserCheck className="h-4 w-4 text-green-600" />
                          )}
                          <span className="font-medium">
                            {(log.contact as any)?.full_name || 'Unknown'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {log.flagged && (
                            <Badge variant="destructive" className="text-xs">
                              Flagged
                            </Badge>
                          )}
                          <span className="text-muted-foreground text-xs">
                            {new Date(log.check_in_time).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    ))}
                    {canViewLogs && todayLogs.length > 5 && (
                      <Button
                        variant="link"
                        className="p-0 h-auto text-sm"
                        onClick={() => setActiveTab('logs')}
                      >
                        View all logs →
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No access events recorded today.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Contacts Summary Card */}
            {canViewContacts && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Contacts Summary
                  </CardTitle>
                  <CardDescription>
                    Security contact status overview
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        Active Contacts
                      </span>
                      <Badge variant="outline">{activeContactsCount}</Badge>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full mt-4"
                      onClick={() => setActiveTab('contacts')}
                    >
                      View All Contacts
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quick Actions Card */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common security operations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {canRegisterContacts && (
                  <Button asChild variant="outline" className="w-full justify-start">
                    <Link href="/security/contacts/new">
                      <Plus className="mr-2 h-4 w-4" />
                      Register New Contact
                    </Link>
                  </Button>
                )}
                {canViewContacts && (
                  <Button asChild variant="outline" className="w-full justify-start">
                    <Link href="/security/contacts">
                      <Users className="mr-2 h-4 w-4" />
                      Manage All Contacts
                    </Link>
                  </Button>
                )}
                {canViewLogs && (
                  <Button asChild variant="outline" className="w-full justify-start">
                    <Link href="/security/logs">
                      <ClipboardList className="mr-2 h-4 w-4" />
                      View Access Logs
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Verify Tab */}
        {canVerifyCodes && (
          <TabsContent value="verify">
            <CodeVerification />
          </TabsContent>
        )}

        {/* Contacts Tab */}
        {canViewContacts && (
          <TabsContent value="contacts" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Security Contacts</h2>
                <p className="text-sm text-muted-foreground">
                  Manage authorized visitors and staff for residents
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href="/security/contacts">
                  View Full List →
                </Link>
              </Button>
            </div>
            <SecurityContactsTable />
          </TabsContent>
        )}

        {/* Access Logs Tab */}
        {canViewLogs && (
          <TabsContent value="logs" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Access Logs</h2>
                <p className="text-sm text-muted-foreground">
                  Today's check-in and check-out records
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href="/security/logs">
                  View Full History →
                </Link>
              </Button>
            </div>
            <Card>
              <CardContent className="pt-6">
                {logsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : todayLogs && todayLogs.length > 0 ? (
                  <div className="space-y-4">
                    {todayLogs.map((log) => (
                      <div
                        key={log.id}
                        className={`flex items-center justify-between p-4 border rounded-lg ${
                          log.flagged ? 'border-destructive bg-destructive/5' : ''
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {(log.contact as any)?.full_name || 'Unknown Contact'}
                            </span>
                            {log.flagged && (
                              <Badge variant="destructive">Flagged</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Visiting: {(log.resident as any)?.first_name} {(log.resident as any)?.last_name}
                          </div>
                          {log.gate_location && (
                            <div className="text-xs text-muted-foreground">
                              Gate: {log.gate_location}
                            </div>
                          )}
                        </div>
                        <div className="text-right space-y-1">
                          <div className="flex items-center gap-2 text-sm">
                            <UserCheck className="h-4 w-4 text-green-600" />
                            <span>In: {new Date(log.check_in_time).toLocaleTimeString()}</span>
                          </div>
                          {log.check_out_time ? (
                            <div className="flex items-center gap-2 text-sm">
                              <UserX className="h-4 w-4 text-muted-foreground" />
                              <span>Out: {new Date(log.check_out_time).toLocaleTimeString()}</span>
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              Still inside
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No access logs recorded today</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
