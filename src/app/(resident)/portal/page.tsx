'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-provider';
import { useResident } from '@/hooks/use-residents';
import { useInvoices, useResidentIndebtedness, useResidentWallet } from '@/hooks/use-billing';
import { useResidentSecurityContacts } from '@/hooks/use-security';
import { useHouseResidentsBatch } from '@/hooks/use-houses';
import { usePublishedAnnouncements } from '@/hooks/use-announcements';
import { NahidStatsCards } from '@/components/resident-portal/dashboard/nahid-stats-cards';
import { NahidInvoicesTable } from '@/components/resident-portal/dashboard/nahid-invoices-table';
import { WalletTopUpDialog } from '@/components/resident-portal/wallet-topup-dialog';
import { VisitorAccessDialog } from '@/components/resident-portal/visitor-access-dialog';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Shield, CreditCard, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

// Spring physics for smooth, professional animations
const spring = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
  mass: 1,
};

// Stagger animation variants for content sections
const sectionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (custom: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      ...spring,
      delay: custom * 0.15, // 150ms stagger between sections
    },
  }),
};

export default function ResidentPortalHomePage() {
  const { residentId } = useAuth();
  const router = useRouter();

  // Guard: If no residentId, render minimal loader
  // This allows ImpersonationPortalWrapper to show selector dialog
  if (!residentId) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Dialog state
  const [topUpDialogOpen, setTopUpDialogOpen] = useState(false);
  const [visitorDialogOpen, setVisitorDialogOpen] = useState(false);

  // Fetch Resident Data - Now safe: residentId exists
  const { data: resident, isLoading: residentLoading } = useResident(residentId);
  const { data: indebtedness, isLoading: indebtednessLoading } = useResidentIndebtedness(residentId);
  const { data: wallet, isLoading: walletLoading } = useResidentWallet(residentId);
  const { data: contactsData, isLoading: contactsLoading } = useResidentSecurityContacts(residentId);

  // Fetch Invoices (for recent transactions table)
  const { data: invoicesData } = useInvoices({
    residentId: residentId,
    limit: 5
  });

  // Fetch Announcements
  const { data: announcements = [], isLoading: announcementsLoading } = usePublishedAnnouncements({ limit: 5 });

  // Compute Properties Count
  const propertyCount = useMemo(() => {
    return resident?.resident_houses?.filter(rh => rh.is_active).length || 0;
  }, [resident]);

  // Compute Active Security Contacts
  const securityContactsCount = useMemo(() => {
    return contactsData?.data?.filter(c => c.status === 'active')?.length || 0;
  }, [contactsData]);

  // Derived Values
  const walletBalance = wallet?.balance || 0;
  const invoices = invoicesData?.data || [];
  const latestAnnouncement = announcements && announcements.length > 0 ? announcements[0] : null;

  // Loading State
  const isLoading = residentLoading || indebtednessLoading || walletLoading || contactsLoading;

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-8 pb-10">
      {/* Hero Section: Financial Overview, Quick Actions, Latest Update */}
      <div className="space-y-8">
        {/* Page Title */}
        <motion.div
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
          custom={0}
        >
          <h1 className="text-[28px] font-bold text-bill-text tracking-tight">Dashboard</h1>
          <p className="text-bill-text-secondary mt-1">Welcome back, {resident?.first_name || 'Resident'}</p>
        </motion.div>

        {/* Stats Row */}
        <motion.div
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
          custom={1}
        >
          <NahidStatsCards
            walletBalance={walletBalance}
            propertyCount={propertyCount}
            securityContactsCount={securityContactsCount}
            onTopUpClick={() => setTopUpDialogOpen(true)}
            onViewPropertiesClick={() => router.push('/portal/properties')}
            onAddVisitorClick={() => setVisitorDialogOpen(true)}
          />
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content: Transactions & Charts */}
          <motion.div
            className="lg:col-span-2 space-y-8"
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            custom={2}
          >
            {/* Placeholder for Analytics/Charts if needed */}

            {/* Transactions Table */}
            <NahidInvoicesTable invoices={invoices} />
          </motion.div>

          {/* Side Content: Announcements / Quick Actions */}
          <motion.div
            className="space-y-6"
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            custom={2.5}
          >
            {/* Announcements Card */}
            <div className="bg-bill-card border border-border rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <h3 className="text-lg font-semibold text-bill-text mb-4">Latest Updates</h3>
              {latestAnnouncement ? (
                <div>
                  <span className="text-xs font-medium text-bill-mint mb-2 block">
                    {new Date(latestAnnouncement.created_at || new Date()).toLocaleDateString()}
                  </span>
                  <h4 className="font-medium text-bill-text mb-2 line-clamp-2">{latestAnnouncement.title}</h4>
                  <p className="text-sm text-bill-text-secondary line-clamp-3 mb-4">
                    {latestAnnouncement.content}
                  </p>
                  <Button variant="outline" size="sm" className="w-full">Read More</Button>
                </div>
              ) : (
                <p className="text-sm text-bill-text-secondary">No recent updates.</p>
              )}
            </div>

            {/* Quick Actions Card */}
            <div className="bg-bill-secondary/50 rounded-2xl p-6 border border-border">
              <h3 className="text-sm font-semibold text-bill-text uppercase tracking-wider mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <Link href="/portal/security-contacts" className="block">
                  <Button variant="outline" className="w-full justify-start bg-bill-card">
                    <Shield className="mr-2 h-4 w-4" />
                    Add Visitor
                  </Button>
                </Link>
                <Link href="/portal/invoices" className="block">
                  <Button variant="outline" className="w-full justify-start bg-bill-card">
                    <CreditCard className="mr-2 h-4 w-4" />
                    Pay Bills
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Dialogs */}
      <WalletTopUpDialog
        open={topUpDialogOpen}
        onOpenChange={setTopUpDialogOpen}
        currentBalance={walletBalance}
      />

      <VisitorAccessDialog
        open={visitorDialogOpen}
        onOpenChange={setVisitorDialogOpen}
      />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[300px]">
        <Skeleton className="lg:col-span-6 rounded-[24px]" />
        <Skeleton className="lg:col-span-3 rounded-[24px]" />
        <Skeleton className="lg:col-span-3 rounded-[24px]" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-48">
        <Skeleton className="rounded-[24px]" />
        <Skeleton className="rounded-[24px]" />
        <Skeleton className="rounded-[24px]" />
      </div>
      <Skeleton className="h-96 w-full rounded-[24px]" />
    </div>
  );
}
