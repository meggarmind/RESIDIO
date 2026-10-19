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
  BarChart3,
} from 'lucide-react';
import Link from 'next/link';
import { SecurityContactsTable } from '@/components/security/security-contacts-table';
import { CodeVerification } from '@/components/security/code-verification';
import { VisitorAnalyticsPanel } from '@/components/security/visitor-analytics-panel';
import {
  useSecurityContacts,
  useTodayAccessLogs,
  useCurrentUserSecurityPermissions,
  useActiveContactCount,
  useExpiredContactCount,
  useExpiringContactCount,
  useSuspendedContactCount,
} from '@/hooks/use-security';
import type { SecurityContactFilters } from '@/lib/validators/security-contact';
import {
  EnhancedStatCard,
  EnhancedTableCard,
  EnhancedPageHeader,
} from '@/components/dashboard/enhanced-stat-card';
import { ModernSkeleton, ModernStatsCardSkeleton } from '@/components/dashboard/modern-skeleton';
import { cn, embed } from '@/lib/utils';

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
  const { data: suspendedCount, isLoading: suspendedCountLoading } = useSuspendedContactCount();

  const canViewContacts = permissionsData?.permissions?.view_contacts || false;
  const canRegisterContacts = permissionsData?.permissions?.register_contacts || false;
  const canVerifyCodes = permissionsData?.permissions?.verify_codes || false;
  const canViewLogs = permissionsData?.permissions?.view_access_logs || false;

  // Use the accurate active count (excludes expired contacts)
  const activeContactsCount = activeCount ?? 0;
  const expiredContactsCount = expiredCount ?? 0;
  const expiringContactsCount = expiringCount ?? 0;
  const suspendedContactsCount = suspendedCount ?? 0;
  const todayCheckIns = todayLogs?.filter(log => log.check_in_time)?.length || 0;
  const currentlyInside = todayLogs?.filter(log => log.check_in_time && !log.check_out_time)?.length || 0;
  const flaggedToday = todayLogs?.filter(log => log.flagged)?.length || 0;

  if (permissionsLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <ModernSkeleton className="h-9 w-40" />
            <ModernSkeleton className="h-5 w-80 mt-2" />
          </div>
          <ModernSkeleton className="h-10 w-36 rounded-xl" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {[...Array(6)].map((_, i) => (
            <ModernStatsCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <EnhancedPageHeader
        title="Security"
        description="Manage access control, security contacts, and visitor verification"
        icon={Shield}
        actions={
          canRegisterContacts ? (
            <Button
              asChild
            >
              <Link href="/security/contacts/new">
                <Plus className="mr-2 h-4 w-4" />
                Register Contact
              </Link>
            </Button>
          ) : null
        }
      />

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <EnhancedStatCard
          title="Active Contacts"
          value={activeContactsCount}
          icon={CheckCircle}
          isLoading={activeCountLoading}
          description="With valid access codes"
          accentColor="success"
        />

        <EnhancedStatCard
          title="Expiring Soon"
          value={expiringContactsCount}
          icon={Clock}
          isLoading={expiringCountLoading}
          description="Within 7 days"
          accentColor={expiringContactsCount > 0 ? 'warning' : 'default'}
        />

        <EnhancedStatCard
          title="Expired"
          value={expiredContactsCount}
          icon={AlertTriangle}
          isLoading={expiredCountLoading}
          description="No valid codes"
          accentColor={expiredContactsCount > 0 ? 'danger' : 'default'}
        />

        <EnhancedStatCard
          title="Suspended"
          value={suspendedContactsCount}
          icon={UserX}
          isLoading={suspendedCountLoading}
          description="Access revoked"
          accentColor={suspendedContactsCount > 0 ? 'warning' : 'default'}
        />

        <EnhancedStatCard
          title="Today’s Check-ins"
          value={todayCheckIns}
          icon={UserCheck}
          isLoading={logsLoading}
          description="Visitors checked in today"
          accentColor="info"
        />

        <EnhancedStatCard
          title="Currently Inside"
          value={currentlyInside}
          icon={Users}
          isLoading={logsLoading}
          description="Not yet checked out"
          accentColor={currentlyInside > 0 ? 'info' : 'default'}
        />

        <EnhancedStatCard
          title="Flagged Today"
          value={flaggedToday}
          icon={AlertTriangle}
          isLoading={logsLoading}
          description="Suspicious activity reports"
          accentColor={flaggedToday > 0 ? 'danger' : 'success'}
        />
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger
            value="overview"
            className={cn('flex items-center gap-2')}
          >
            <Shield className="h-4 w-4" />
            Overview
          </TabsTrigger>
          {canVerifyCodes && (
            <TabsTrigger
              value="verify"
              className={cn('flex items-center gap-2')}
            >
              <ScanLine className="h-4 w-4" />
              Verify Code
            </TabsTrigger>
          )}
          {canViewContacts && (
            <TabsTrigger
              value="contacts"
              className={cn('flex items-center gap-2')}
            >
              <Users className="h-4 w-4" />
              Contacts
            </TabsTrigger>
          )}
          {canViewLogs && (
            <TabsTrigger
              value="logs"
              className={cn('flex items-center gap-2')}
            >
              <ClipboardList className="h-4 w-4" />
              Access Logs
            </TabsTrigger>
          )}
          {canViewLogs && (
            <TabsTrigger
              value="analytics"
              className={cn('flex items-center gap-2')}
            >
              <BarChart3 className="h-4 w-4" />
              Analytics
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
                    <div className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg',
                      'bg-primary/10 dark:bg-primary/20'
                    )}>
                      <ScanLine className={cn(
                        'h-4 w-4',
                        'text-primary'
                      )} />
                    </div>
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
                  <Button
                    onClick={() => setActiveTab('verify')}
                  >
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
                  <div className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg',
                    'bg-primary/10 dark:bg-primary/20'
                  )}>
                    <ClipboardList className={cn(
                      'h-4 w-4',
                      'text-primary'
                    )} />
                  </div>
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
                        className={cn('flex items-center justify-between text-sm border-b pb-2 last:border-0')}
                      >
                        <div className="flex items-center gap-2">
                          {log.check_out_time ? (
                            <UserX className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <UserCheck className="h-4 w-4 text-emerald-600" />
                          )}
                          <span className="font-medium">
                            {embed(log.contact)?.full_name || 'Unknown'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {log.flagged && (
                            <Badge variant="destructive" className={cn('text-xs')}>
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
                    <div className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg',
                      'bg-primary/10 dark:bg-primary/20'
                    )}>
                      <Users className={cn(
                        'h-4 w-4',
                        'text-primary'
                      )} />
                    </div>
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
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                        Active Contacts
                      </span>
                      <Badge
                        variant="outline"
                      >
                        {activeContactsCount}
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      className={cn('w-full mt-4')}
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
                  <Button
                    asChild
                    variant="outline"
                    className={cn('w-full justify-start')}
                  >
                    <Link href="/security/contacts/new">
                      <Plus className="mr-2 h-4 w-4" />
                      Register New Contact
                    </Link>
                  </Button>
                )}
                {canViewContacts && (
                  <Button
                    asChild
                    variant="outline"
                    className={cn('w-full justify-start')}
                  >
                    <Link href="/security/contacts">
                      <Users className="mr-2 h-4 w-4" />
                      Manage All Contacts
                    </Link>
                  </Button>
                )}
                {canViewLogs && (
                  <Button
                    asChild
                    variant="outline"
                    className={cn('w-full justify-start')}
                  >
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
                <h2 className={cn('text-xl font-semibold')}>
                  Security Contacts
                </h2>
                <p className="text-sm text-muted-foreground">
                  Manage authorized visitors and staff for residents
                </p>
              </div>
              <Button
                asChild
                variant="outline"
              >
                <Link href="/security/contacts">
                  View Full List →
                </Link>
              </Button>
            </div>
            <SecurityContactsTable />
          </TabsContent>
        )}

        {/* Analytics Tab */}
        {canViewLogs && (
          <TabsContent value="analytics">
            <VisitorAnalyticsPanel />
          </TabsContent>
        )}

        {/* Access Logs Tab */}
        {canViewLogs && (
          <TabsContent value="logs" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className={cn('text-xl font-semibold')}>
                  Access Logs
                </h2>
                <p className="text-sm text-muted-foreground">
                  Today&apos;s check-in and check-out records
                </p>
              </div>
              <Button
                asChild
                variant="outline"
              >
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
                        className={cn(
                          'flex items-center justify-between p-4 border rounded-lg',
                          log.flagged && 'border-destructive bg-destructive/5'
                        )}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {embed(log.contact)?.full_name || 'Unknown Contact'}
                            </span>
                            {log.flagged && (
                              <Badge
                                variant="destructive"
                              >
                                Flagged
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Visiting: {embed(log.resident)?.first_name} {embed(log.resident)?.last_name}
                          </div>
                          {log.gate_location && (
                            <div className="text-xs text-muted-foreground">
                              Gate: {log.gate_location}
                            </div>
                          )}
                        </div>
                        <div className="text-right space-y-1">
                          <div className="flex items-center gap-2 text-sm">
                            <UserCheck className="h-4 w-4 text-emerald-600" />
                            <span>In: {new Date(log.check_in_time).toLocaleTimeString()}</span>
                          </div>
                          {log.check_out_time ? (
                            <div className="flex items-center gap-2 text-sm">
                              <UserX className="h-4 w-4 text-muted-foreground" />
                              <span>Out: {new Date(log.check_out_time).toLocaleTimeString()}</span>
                            </div>
                          ) : (
                            <Badge
                              variant="outline"
                              className={cn('text-xs')}
                            >
                              Still inside
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={cn('text-center py-8')}>
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
