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
  useSuspendedContactCount,
} from '@/hooks/use-security';
import type { SecurityContactFilters } from '@/lib/validators/security-contact';
import {
  EnhancedStatCard,
  EnhancedTableCard,
  EnhancedPageHeader,
} from '@/components/dashboard/enhanced-stat-card';
import { ModernSkeleton, ModernStatsCardSkeleton } from '@/components/dashboard/modern-skeleton';
import { useVisualTheme } from '@/contexts/visual-theme-context';
import { cn } from '@/lib/utils';

export default function SecurityPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [contactFilters, setContactFilters] = useState<SecurityContactFilters>({
    page: 1,
    limit: 10,
  });

  const { themeId } = useVisualTheme();
  const isModern = themeId === 'modern';

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
              className={cn(
                isModern && 'rounded-xl bg-[#0EA5E9] hover:bg-[#0284C7] text-white'
              )}
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
          title="Today's Check-ins"
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
        <TabsList className={cn(
          isModern && 'bg-gray-100 dark:bg-[#1E293B] rounded-xl p-1'
        )}>
          <TabsTrigger
            value="overview"
            className={cn(
              'flex items-center gap-2',
              isModern && 'data-[state=active]:bg-white dark:data-[state=active]:bg-[#334155] rounded-lg'
            )}
          >
            <Shield className="h-4 w-4" />
            Overview
          </TabsTrigger>
          {canVerifyCodes && (
            <TabsTrigger
              value="verify"
              className={cn(
                'flex items-center gap-2',
                isModern && 'data-[state=active]:bg-white dark:data-[state=active]:bg-[#334155] rounded-lg'
              )}
            >
              <ScanLine className="h-4 w-4" />
              Verify Code
            </TabsTrigger>
          )}
          {canViewContacts && (
            <TabsTrigger
              value="contacts"
              className={cn(
                'flex items-center gap-2',
                isModern && 'data-[state=active]:bg-white dark:data-[state=active]:bg-[#334155] rounded-lg'
              )}
            >
              <Users className="h-4 w-4" />
              Contacts
            </TabsTrigger>
          )}
          {canViewLogs && (
            <TabsTrigger
              value="logs"
              className={cn(
                'flex items-center gap-2',
                isModern && 'data-[state=active]:bg-white dark:data-[state=active]:bg-[#334155] rounded-lg'
              )}
            >
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
              <Card className={cn(
                isModern && 'rounded-xl border-gray-200 dark:border-[#334155] bg-white dark:bg-[#1E293B]'
              )}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <div className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg',
                      isModern
                        ? 'bg-[#0EA5E9]/10 dark:bg-[#0EA5E9]/20'
                        : 'bg-primary/10 dark:bg-primary/20'
                    )}>
                      <ScanLine className={cn(
                        'h-4 w-4',
                        isModern ? 'text-[#0EA5E9]' : 'text-primary'
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
                    className={cn(
                      isModern && 'rounded-xl bg-[#0EA5E9] hover:bg-[#0284C7] text-white'
                    )}
                  >
                    <ScanLine className="mr-2 h-4 w-4" />
                    Open Verification
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Recent Activity Card */}
            <Card className={cn(
              isModern && 'rounded-xl border-gray-200 dark:border-[#334155] bg-white dark:bg-[#1E293B]'
            )}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg',
                    isModern
                      ? 'bg-[#0EA5E9]/10 dark:bg-[#0EA5E9]/20'
                      : 'bg-primary/10 dark:bg-primary/20'
                  )}>
                    <ClipboardList className={cn(
                      'h-4 w-4',
                      isModern ? 'text-[#0EA5E9]' : 'text-primary'
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
                        className={cn(
                          'flex items-center justify-between text-sm border-b pb-2 last:border-0',
                          isModern && 'border-gray-100 dark:border-[#334155]'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {log.check_out_time ? (
                            <UserX className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <UserCheck className="h-4 w-4 text-emerald-600" />
                          )}
                          <span className="font-medium">
                            {(log.contact as any)?.full_name || 'Unknown'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {log.flagged && (
                            <Badge variant="destructive" className={cn(
                              'text-xs',
                              isModern && 'rounded-full'
                            )}>
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
              <Card className={cn(
                isModern && 'rounded-xl border-gray-200 dark:border-[#334155] bg-white dark:bg-[#1E293B]'
              )}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <div className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg',
                      isModern
                        ? 'bg-[#0EA5E9]/10 dark:bg-[#0EA5E9]/20'
                        : 'bg-primary/10 dark:bg-primary/20'
                    )}>
                      <Users className={cn(
                        'h-4 w-4',
                        isModern ? 'text-[#0EA5E9]' : 'text-primary'
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
                        className={cn(isModern && 'rounded-full')}
                      >
                        {activeContactsCount}
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full mt-4',
                        isModern && 'rounded-xl'
                      )}
                      onClick={() => setActiveTab('contacts')}
                    >
                      View All Contacts
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quick Actions Card */}
            <Card className={cn(
              isModern && 'rounded-xl border-gray-200 dark:border-[#334155] bg-white dark:bg-[#1E293B]'
            )}>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common security operations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {canRegisterContacts && (
                  <Button
                    asChild
                    variant="outline"
                    className={cn(
                      'w-full justify-start',
                      isModern && 'rounded-xl'
                    )}
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
                    className={cn(
                      'w-full justify-start',
                      isModern && 'rounded-xl'
                    )}
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
                    className={cn(
                      'w-full justify-start',
                      isModern && 'rounded-xl'
                    )}
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
                <h2 className={cn(
                  'text-xl font-semibold',
                  isModern && 'text-gray-900 dark:text-white'
                )}>
                  Security Contacts
                </h2>
                <p className="text-sm text-muted-foreground">
                  Manage authorized visitors and staff for residents
                </p>
              </div>
              <Button
                asChild
                variant="outline"
                className={cn(isModern && 'rounded-xl')}
              >
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
                <h2 className={cn(
                  'text-xl font-semibold',
                  isModern && 'text-gray-900 dark:text-white'
                )}>
                  Access Logs
                </h2>
                <p className="text-sm text-muted-foreground">
                  Today's check-in and check-out records
                </p>
              </div>
              <Button
                asChild
                variant="outline"
                className={cn(isModern && 'rounded-xl')}
              >
                <Link href="/security/logs">
                  View Full History →
                </Link>
              </Button>
            </div>
            <Card className={cn(
              isModern && 'rounded-xl border-gray-200 dark:border-[#334155] bg-white dark:bg-[#1E293B]'
            )}>
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
                          isModern && 'rounded-xl border-gray-100 dark:border-[#334155]',
                          log.flagged && 'border-destructive bg-destructive/5'
                        )}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {(log.contact as any)?.full_name || 'Unknown Contact'}
                            </span>
                            {log.flagged && (
                              <Badge
                                variant="destructive"
                                className={cn(isModern && 'rounded-full')}
                              >
                                Flagged
                              </Badge>
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
                              className={cn(
                                'text-xs',
                                isModern && 'rounded-full'
                              )}
                            >
                              Still inside
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={cn(
                    'text-center py-8',
                    isModern && 'bg-gray-50 dark:bg-[#0F172A] rounded-xl'
                  )}>
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
