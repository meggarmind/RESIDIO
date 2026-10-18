'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart3, CalendarClock, Car, Clock, Loader2, Repeat, TrendingUp, Users } from 'lucide-react';
import { EnhancedStatCard } from '@/components/dashboard/enhanced-stat-card';
import {
  useVisitorDashboardStats,
  useFrequentVisitors,
  useVisitorAnalytics,
  useTodayExpectedRecurringVisitors,
  useCurrentUserSecurityPermissions,
} from '@/hooks/use-security';
import { formatDuration } from './contact-visit-history-card';

const PAGE_SIZE = 10;

/**
 * Read-only visitor analytics (#121, AD-04). Rendered only for security.view_logs,
 * the permission every analytics read enforces; today's expected visitors need security.view.
 */
export function VisitorAnalyticsPanel() {
  const { data: permissionsData } = useCurrentUserSecurityPermissions();
  const canViewContacts = permissionsData?.permissions?.view_contacts || false;
  const [page, setPage] = useState(1);

  const { data: stats, isLoading: statsLoading } = useVisitorDashboardStats();
  const { data: frequent, isLoading: frequentLoading } = useFrequentVisitors(5, 30, 10);
  const { data: analytics, isLoading: analyticsLoading } = useVisitorAnalytics({ page, limit: PAGE_SIZE });

  const totalPages = Math.ceil((analytics?.count ?? 0) / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <EnhancedStatCard
          title="Visits Today"
          value={stats?.todayVisits ?? 0}
          icon={TrendingUp}
          isLoading={statsLoading}
          description={`${stats?.weeklyVisits ?? 0} this week · ${stats?.monthlyVisits ?? 0} in 30 days`}
          accentColor="info"
        />
        <EnhancedStatCard
          title="Average Stay"
          value={formatDuration(stats?.averageDurationMinutes)}
          icon={Clock}
          isLoading={statsLoading}
          description="Completed visits, last 30 days"
        />
        <EnhancedStatCard
          title="Recurring Visitors"
          value={stats?.recurringVisitors ?? 0}
          icon={Repeat}
          isLoading={statsLoading}
          description={`${stats?.frequentVisitors ?? 0} marked frequent`}
        />
        <EnhancedStatCard
          title="Registered Vehicles"
          value={stats?.vehiclesRegistered ?? 0}
          icon={Car}
          isLoading={statsLoading}
          description={`${stats?.totalActiveContacts ?? 0} active contacts`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Frequent Visitors
            </CardTitle>
            <CardDescription>5 or more visits in the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {frequentLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : frequent && frequent.length > 0 ? (
              <div className="space-y-2">
                {frequent.map((visitor) => (
                  <div
                    key={visitor.contact_id}
                    className="flex items-center justify-between text-sm border-b pb-2 last:border-0"
                  >
                    <div>
                      <Link href={`/security/contacts/${visitor.contact_id}`} className="font-medium hover:underline">
                        {visitor.full_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {visitor.category_name} · visiting {visitor.resident_name} ({visitor.resident_code})
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge variant="secondary">{visitor.visit_count} visits</Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        Last {new Date(visitor.last_visit_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No frequent visitors in the last 30 days.</p>
            )}
          </CardContent>
        </Card>

        {canViewContacts && <ExpectedTodayCard />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Visitors by Visit Count
          </CardTitle>
          <CardDescription>All contacts, most visits first</CardDescription>
        </CardHeader>
        <CardContent>
          {analyticsLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : analytics && analytics.data.length > 0 ? (
            <div className="space-y-2">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Contact</th>
                      <th className="py-2 pr-4 font-medium">Resident</th>
                      <th className="py-2 pr-4 font-medium text-right">7 days</th>
                      <th className="py-2 pr-4 font-medium text-right">30 days</th>
                      <th className="py-2 pr-4 font-medium text-right">All time</th>
                      <th className="py-2 pr-4 font-medium text-right">Avg stay</th>
                      <th className="py-2 font-medium">Last visit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.data.map((row) => (
                      <tr key={row.contact_id} className="border-b last:border-0">
                        <td className="py-2 pr-4">
                          <Link href={`/security/contacts/${row.contact_id}`} className="font-medium hover:underline">
                            {row.full_name}
                          </Link>
                          <p className="text-xs text-muted-foreground">{row.category_name}</p>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {row.resident_first_name} {row.resident_last_name} ({row.resident_code})
                        </td>
                        <td className="py-2 pr-4 text-right">{row.visits_last_7_days}</td>
                        <td className="py-2 pr-4 text-right">{row.visits_last_30_days}</td>
                        <td className="py-2 pr-4 text-right font-medium">{row.visit_count}</td>
                        <td className="py-2 pr-4 text-right">{formatDuration(row.avg_visit_duration_minutes)}</td>
                        <td className="py-2 text-muted-foreground">
                          {row.last_visit_at ? new Date(row.last_visit_at).toLocaleDateString() : 'Never'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-muted-foreground">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={page >= totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No visitor activity recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ExpectedTodayCard() {
  const { data: expected, isLoading } = useTodayExpectedRecurringVisitors();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" />
          Expected Today
        </CardTitle>
        <CardDescription>Recurring visitors scheduled for today</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : expected && expected.length > 0 ? (
          <div className="space-y-2">
            {expected.map((visitor) => (
              <div
                key={visitor.id}
                className="flex items-center justify-between text-sm border-b pb-2 last:border-0"
              >
                <div>
                  <Link href={`/security/contacts/${visitor.id}`} className="font-medium hover:underline">
                    {visitor.full_name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    Visiting {visitor.resident.first_name} {visitor.resident.last_name} ({visitor.resident.resident_code})
                    {visitor.purpose && ` · ${visitor.purpose}`}
                  </p>
                </div>
                {visitor.expected_arrival_time && (
                  <span className="text-xs text-muted-foreground">
                    {visitor.expected_arrival_time.slice(0, 5)}
                    {visitor.expected_departure_time && `–${visitor.expected_departure_time.slice(0, 5)}`}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No recurring visitors expected today.</p>
        )}
      </CardContent>
    </Card>
  );
}
