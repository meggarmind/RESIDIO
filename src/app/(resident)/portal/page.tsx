'use client';

import { Suspense, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-provider';
import { useResident } from '@/hooks/use-residents';
import { useInvoices, useResidentIndebtedness, useResidentWallet } from '@/hooks/use-billing';
import { useResidentSecurityContacts } from '@/hooks/use-security';
import { usePublishedAnnouncements } from '@/hooks/use-announcements';
import { useResidentDocuments } from '@/hooks/use-documents';
import { DashboardGreeting } from '@/components/resident-portal/dashboard-greeting';
import { MetricCard } from '@/components/resident-portal/metric-card';
import { FeatureCard } from '@/components/resident-portal/feature-card';
import { FinancialSummaryStats } from '@/components/resident-portal/financial-summary-stats';
import { PaymentTimeline, type PaymentTimelineItem } from '@/components/resident-portal/payment-timeline';
import { AnnouncementsFeed, type AnnouncementFeedItem } from '@/components/resident-portal/announcements-feed';
import { WalletTopUpDialog } from '@/components/resident-portal/wallet-topup-dialog';
import { VisitorAccessDialog } from '@/components/resident-portal/visitor-access-dialog';
import { MyPropertiesCard } from '@/components/resident-portal/my-properties-card';
import { VisitorQuickAccessCarousel } from '@/components/resident-portal/visitor-quick-access-carousel';
import { NairaIcon } from '@/components/icons/naira-icon';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useUserRoles } from '@/hooks/use-user-roles';
import { PortfolioDashboard } from '@/components/resident-portal/portfolio-dashboard';
import {
  Building,
  Shield,
  FileText,
  UserPlus,
  Receipt,
  Wallet,
  TrendingUp,
  Loader2,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/utils';

// Spring physics for smooth animations
const spring = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
  mass: 1,
};

// Stagger animation variants
const sectionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (custom: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      ...spring,
      delay: custom * 0.1,
    },
  }),
};

/**
 * Inner component that uses useSearchParams (requires Suspense boundary)
 */
function ResidentPortalHomePageInner() {
  const { residentId } = useAuth();
  const searchParams = useSearchParams();

  // Dialog state
  const [topUpDialogOpen, setTopUpDialogOpen] = useState(false);
  const [visitorDialogOpen, setVisitorDialogOpen] = useState(false);

  // Check if we're in impersonation mode
  const impersonateMode = searchParams.get('impersonate') === 'true';

  // Fetch Data
  const { data: resident, isLoading: residentLoading } = useResident(residentId || '');
  const { data: indebtedness, isLoading: indebtednessLoading } = useResidentIndebtedness(residentId || '');
  const { data: wallet, isLoading: walletLoading } = useResidentWallet(residentId || '');
  const { data: contactsData, isLoading: contactsLoading } = useResidentSecurityContacts(residentId || '');
  const { data: invoicesData } = useInvoices({
    residentId: residentId || '',
    limit: 5,
  });
  const { data: announcements = [] } = usePublishedAnnouncements({ limit: 5 });
  const { data: documentsData } = useResidentDocuments();

  // Derived values (must come before any conditional returns to follow Rules of Hooks)
  const walletBalance = wallet?.balance || 0;
  const totalOwed = indebtedness?.totalUnpaid || 0;
  const firstName = resident?.first_name || 'Resident';

  // Wrap invoices in useMemo to prevent unnecessary re-renders
  const invoices = useMemo(() => invoicesData?.data || [], [invoicesData?.data]);

  // Compute metrics (all useMemo hooks must be called before conditional returns)
  const propertyCount = useMemo(() => {
    return resident?.resident_houses?.filter((rh) => rh.is_active).length || 0;
  }, [resident]);

  const securityContactsCount = useMemo(() => {
    return contactsData?.data?.filter((c) => c.status === 'active')?.length || 0;
  }, [contactsData]);

  // Documents count - real data
  const documentsCount = useMemo(() => {
    return documentsData?.data?.length || 0;
  }, [documentsData]);

  // Visitors count - filtered from security contacts
  const visitorsCount = useMemo(() => {
    return contactsData?.data?.filter((c) => c.category?.name === 'Visitor' && c.status === 'active')?.length || 0;
  }, [contactsData]);

  // Time-based greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  // Calculate actual trends from real data
  const currentMonthInvoices = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return invoices.filter((inv) => new Date(inv.created_at || '') >= startOfMonth).length;
  }, [invoices]);

  const overdueThisWeek = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Start of current week (Sunday)
    return invoices.filter(
      (inv) => inv.status === 'overdue' && new Date(inv.due_date || '') >= startOfWeek
    ).length;
  }, [invoices]);

  // Note: Balance trend would require wallet transaction history
  // Keeping a placeholder for now until we implement transaction-based calculation
  const balanceTrend = null; // Set to null to hide trend until implemented

  // Prepare Financial Summary Stats data
  const overdueInvoices = useMemo(() => {
    const overdue = invoices.filter((inv) => inv.status === 'overdue');
    const totalAmount = overdue.reduce((sum, inv) => sum + (inv.amount_due || 0), 0);
    return { count: overdue.length, amount: totalAmount };
  }, [invoices]);

  const dueSoonInvoices = useMemo(() => {
    const now = new Date();
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(now.getDate() + 7);

    const dueSoon = invoices.filter((inv) => {
      if (inv.status === 'paid' || inv.status === 'overdue') return false;
      const dueDate = new Date(inv.due_date || '');
      return dueDate > now && dueDate <= sevenDaysFromNow;
    });
    const totalAmount = dueSoon.reduce((sum, inv) => sum + (inv.amount_due || 0), 0);
    return { count: dueSoon.length, amount: totalAmount };
  }, [invoices]);

  const paidThisMonthInvoices = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const paid = invoices.filter((inv) => {
      if (inv.status !== 'paid') return false;
      // Assuming there's a paid_at or updated_at field for payment date
      const paidDate = new Date(inv.updated_at || inv.created_at || '');
      return paidDate >= startOfMonth;
    });
    const totalAmount = paid.reduce((sum, inv) => sum + (inv.amount_due || 0), 0);
    return { count: paid.length, amount: totalAmount };
  }, [invoices]);

  // Prepare Payment Timeline data
  const upcomingPayments = useMemo((): PaymentTimelineItem[] => {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    return invoices
      .filter((inv) => {
        if (inv.status === 'paid') return false;
        const dueDate = new Date(inv.due_date || '');
        return dueDate <= thirtyDaysFromNow;
      })
      .map((inv) => {
        const dueDate = new Date(inv.due_date || '');
        const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        let status: PaymentTimelineItem['status'];
        if (inv.status === 'overdue' || daysUntilDue < 0) {
          status = 'overdue';
        } else if (daysUntilDue <= 7) {
          status = 'due_soon';
        } else {
          status = 'upcoming';
        }

        return {
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number || '',
          dueDate,
          amount: inv.amount_due || 0,
          status,
          daysUntilDue: Math.max(0, daysUntilDue),
          invoiceType: inv.invoice_type,
        };
      })
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .slice(0, 5); // Show top 5 upcoming payments
  }, [invoices]);

  // Prepare Announcements Feed data
  const announcementsFeedData = useMemo((): AnnouncementFeedItem[] => {
    return announcements.slice(0, 5).map((ann) => ({
      id: ann.id,
      title: ann.title || '',
      content: ann.content?.substring(0, 100), // Truncate to 100 chars
      priority: ann.priority as AnnouncementFeedItem['priority'],
      category: (typeof ann.category === 'object' ? ann.category?.name : ann.category) || 'General',
      createdAt: new Date(ann.published_at || ann.created_at || ''),
      isRead: false, // TODO: Implement read status tracking
    }));
  }, [announcements]);

  // Active properties for My Properties widget
  const activeProperties = useMemo(() => {
    return resident?.resident_houses?.filter((rh) => rh.is_active) || [];
  }, [resident]);

  // Loading state check (after all hooks are called)
  const isLoading = residentLoading || indebtednessLoading || walletLoading || contactsLoading;

  // Guard: If no residentId (after all hooks are called)
  if (!residentId) {
    if (impersonateMode) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] text-center">
          <p className="text-muted-foreground">Select a resident to view their portal</p>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Check for dashboard mode (Home vs Portfolio)
  const { mode } = useUserRoles();

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  // Render Portfolio Dashboard if in 'portfolio' mode
  if (mode === 'portfolio') {
    return <PortfolioDashboard />;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
      {/* Main Content Column */}
      <div className="space-y-8">
        {/* Greeting Section */}
        <motion.div variants={sectionVariants} initial="hidden" animate="visible" custom={0}>
          <DashboardGreeting
            userName={firstName}
            greeting={greeting}
            subtitle="Let's check your asset"
          />
        </motion.div>

        {/* Top Metrics Row (3 columns) */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
          custom={1}
        >
          <MetricCard
            label="Wallet Balance"
            value={formatCurrency(walletBalance)}
            trend={balanceTrend}
            icon={<Wallet />}
            iconColor="blue"
          />
          <MetricCard
            label="Invoices"
            value={invoices.length.toString()}
            subtitle={`${currentMonthInvoices} this month`}
            icon={<NairaIcon />}
            iconColor="purple"
          />
          <MetricCard
            label="Outstanding"
            value={formatCurrency(totalOwed)}
            subtitle={`${overdueThisWeek} overdue this week`}
            icon={<TrendingUp />}
            iconColor="orange"
          />
        </motion.div>

        {/* My Assets Section (4 columns: My Properties first + 3 feature cards) */}
        <motion.div variants={sectionVariants} initial="hidden" animate="visible" custom={2}>
          <h2
            className="mb-4"
            style={{
              fontSize: 'var(--text-lg)',
              fontWeight: 'var(--font-semibold)',
              color: 'var(--foreground)',
            }}
          >
            My Assets
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* My Properties - FIRST column */}
            <div
              className="rounded-2xl p-4 relative overflow-hidden"
              style={{
                backgroundColor: 'var(--primary)',
              }}
            >
              {propertyCount > 1 && (
                <Link
                  href="/portal/properties"
                  className="absolute top-3 right-3 text-xs hover:underline z-10"
                  style={{ color: 'var(--primary-foreground)' }}
                >
                  View All
                </Link>
              )}
              <MyPropertiesCard
                properties={activeProperties.slice(0, 2)}
                totalPropertyCount={propertyCount}
                isLoading={residentLoading}
                className="themed-properties"
              />
            </div>
            <FeatureCard
              title="Security Contacts"
              subtitle={`${securityContactsCount} Active Contacts`}
              icon={<Shield />}
              iconColor="pink"
              href="/portal/security-contacts"
            />
            <FeatureCard
              title="Documents"
              subtitle={`${documentsCount} Files Available`}
              icon={<FileText />}
              iconColor="green"
              href="/portal/documents"
            />
            <FeatureCard
              title="Visitors"
              subtitle={`${visitorsCount} Registered`}
              icon={<UserPlus />}
              iconColor="orange"
              href="/portal/visitors"
            />
          </div>
        </motion.div>

        {/* Quick Access Carousel */}
        <motion.div variants={sectionVariants} initial="hidden" animate="visible" custom={2.2}>
          <VisitorQuickAccessCarousel
            contacts={contactsData?.data || []}
            isLoading={contactsLoading}
          />
        </motion.div>

        {/* Latest Announcements (Horizontal Card) */}
        <motion.div variants={sectionVariants} initial="hidden" animate="visible" custom={2.5}>
          <AnnouncementsFeed announcements={announcementsFeedData} />
        </motion.div>
      </div>

      {/* Right Sidebar Column (Desktop only) */}
      <motion.div
        className="hidden lg:block space-y-6"
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
        custom={1.5}
      >
        {/* Financial Summary Stats (2x2 grid) */}
        <FinancialSummaryStats
          stats={[
            {
              label: 'Overdue',
              value: overdueInvoices.amount,
              subtitle: `${overdueInvoices.count} invoice${overdueInvoices.count !== 1 ? 's' : ''}`,
              icon: AlertCircle,
              iconColor: 'orange',
              href: '/portal/invoices?status=overdue',
            },
            {
              label: 'Due Soon',
              value: dueSoonInvoices.amount,
              subtitle: `${dueSoonInvoices.count} invoice${dueSoonInvoices.count !== 1 ? 's' : ''}`,
              icon: Clock,
              iconColor: 'purple',
              href: '/portal/invoices?status=unpaid',
            },
            {
              label: 'Paid MTD',
              value: paidThisMonthInvoices.amount,
              subtitle: `${paidThisMonthInvoices.count} payment${paidThisMonthInvoices.count !== 1 ? 's' : ''}`,
              icon: TrendingUp,
              iconColor: 'green',
            },
            {
              label: 'Wallet',
              value: walletBalance,
              subtitle: 'Available',
              icon: Wallet,
              iconColor: 'blue',
              href: '/portal/wallet',
            },
          ]}
        />

        {/* Payment Timeline */}
        <PaymentTimeline items={upcomingPayments} />

        {/* Recent Invoices (moved from main content) */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2
              style={{
                fontSize: 'var(--text-base)',
                fontWeight: 'var(--font-semibold)',
                color: 'var(--foreground)',
              }}
            >
              Recent Invoices
            </h2>
            <Link
              href="/portal/invoices"
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--primary)',
                fontWeight: 'var(--font-medium)',
              }}
            >
              View All
            </Link>
          </div>

          {invoices.length > 0 ? (
            <div className="overflow-y-auto" style={{ maxHeight: '500px' }}>
              <table className="w-full">
                <thead className="sticky top-0" style={{ backgroundColor: 'var(--bg-card)' }}>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--input)',
                    }}
                  >
                    <th
                      className="text-left pb-2"
                      style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 'var(--font-semibold)',
                        color: 'hsl(var(--muted-foreground))',
                        textTransform: 'uppercase',
                      }}
                    >
                      Invoice
                    </th>
                    <th
                      className="text-right pb-2"
                      style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 'var(--font-semibold)',
                        color: 'hsl(var(--muted-foreground))',
                        textTransform: 'uppercase',
                      }}
                    >
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice, index) => (
                    <tr
                      key={invoice.id}
                      style={{
                        borderBottom:
                          index !== invoices.length - 1
                            ? '1px solid var(--input)'
                            : 'none',
                      }}
                    >
                      <td className="py-2">
                        <div>
                          <p
                            style={{
                              fontSize: 'var(--text-sm)',
                              fontWeight: 'var(--font-medium)',
                              color: 'var(--foreground)',
                            }}
                          >
                            #{invoice.invoice_number}
                          </p>
                          <p
                            style={{
                              fontSize: 'var(--text-xs)',
                              color: 'var(--muted-foreground)',
                            }}
                          >
                            {new Date(invoice.due_date || '').toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </p>
                        </div>
                      </td>
                      <td className="py-2 text-right">
                        <p
                          style={{
                            fontSize: 'var(--text-sm)',
                            fontWeight: 'var(--font-semibold)',
                            color: 'var(--foreground)',
                          }}
                        >
                          {formatCurrency(invoice.amount_due)}
                        </p>
                        <Badge
                          variant={
                            invoice.status === 'paid'
                              ? 'success'
                              : invoice.status === 'overdue'
                                ? 'destructive'
                                : 'warning'
                          }
                          className="text-xs mt-1"
                        >
                          {invoice.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--muted-foreground)',
                textAlign: 'center',
                padding: 'var(--space-6) 0',
              }}
            >
              No recent invoices
            </p>
          )}
        </div>
      </motion.div>

      {/* Dialogs */}
      <WalletTopUpDialog
        open={topUpDialogOpen}
        onOpenChange={setTopUpDialogOpen}
        currentBalance={walletBalance}
      />

      <VisitorAccessDialog open={visitorDialogOpen} onOpenChange={setVisitorDialogOpen} />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
      {/* Main Content Skeleton */}
      <div className="space-y-8">
        <Skeleton style={{ height: '80px', borderRadius: 'var(--radius-lg)' }} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton style={{ height: '160px', borderRadius: 'var(--radius-lg)' }} />
          <Skeleton style={{ height: '160px', borderRadius: 'var(--radius-lg)' }} />
          <Skeleton style={{ height: '160px', borderRadius: 'var(--radius-lg)' }} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton style={{ height: '120px', borderRadius: 'var(--radius-lg)' }} />
          <Skeleton style={{ height: '120px', borderRadius: 'var(--radius-lg)' }} />
          <Skeleton style={{ height: '120px', borderRadius: 'var(--radius-lg)' }} />
          <Skeleton style={{ height: '120px', borderRadius: 'var(--radius-lg)' }} />
        </div>
        <Skeleton style={{ height: '400px', borderRadius: 'var(--radius-lg)' }} />
      </div>

      {/* Right Sidebar Skeleton */}
      <div className="hidden lg:block space-y-6">
        <Skeleton style={{ height: '180px', borderRadius: 'var(--radius-lg)' }} />
        <Skeleton style={{ height: '280px', borderRadius: 'var(--radius-lg)' }} />
        <Skeleton style={{ height: '220px', borderRadius: 'var(--radius-lg)' }} />
      </div>
    </div>
  );
}

/**
 * Resident Portal Home Page - Modern Design System
 *
 * Complete dashboard redesign following the portal-modern design template with:
 * - Greeting section with time-based greeting
 * - Top 3 metric cards (Total Balance, Invoices, Outstanding)
 * - My Assets grid (4 feature cards: Properties, Security Contacts, Documents, Visitors)
 * - Recent invoices table with status badges
 * - Right sidebar (desktop only) with quick stats, calendar, and activity log
 *
 * Layout: 2-column grid on desktop (main content + 280px sidebar)
 * Mobile: Single column, sidebar content moved below or hidden
 */
export default function ResidentPortalHomePage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <ResidentPortalHomePageInner />
    </Suspense>
  );
}
