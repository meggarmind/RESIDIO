'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Building2, Users, Wallet, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-provider';
import { useResident } from '@/hooks/use-residents';
import { MetricCard } from './metric-card';
import { PropertyPortfolioCard } from './property-portfolio-card';
import { ComplianceStatusWidget } from './compliance-status-widget';
import { Skeleton } from '@/components/ui/skeleton';

// Spring physics for smooth animations
const spring = {
    type: 'spring' as const,
    stiffness: 300,
    damping: 30,
    mass: 1,
};

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

export function PortfolioDashboard() {
    const { residentId } = useAuth();
    const { data: resident, isLoading } = useResident(residentId || '');

    // Filter for properties where user is a landlord or developer
    const portfolioProperties = useMemo(() => {
        if (!resident?.resident_houses) return [];

        // Roles that qualify for "My Portfolio" view
        const landlordRoles = ['resident_landlord', 'non_resident_landlord', 'developer'];
        return resident.resident_houses.filter(rh =>
            landlordRoles.includes(rh.resident_role) && rh.is_active
        );
    }, [resident]);

    const totalProperties = portfolioProperties.length;
    // Mock occupancy for now (would need actual house occupancy data which isn't in resident_houses deep query yet)
    const occupancyRate = 100;
    // Mock arrears
    const totalArrears = 0;

    if (isLoading) {
        return <PortfolioDashboardSkeleton />;
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
            {/* Main Content */}
            <div className="space-y-8">
                <motion.div variants={sectionVariants} initial="hidden" animate="visible" custom={0}>
                    <h2 className="text-2xl font-semibold tracking-tight">Portfolio Overview</h2>
                    <p className="text-muted-foreground">Manage your properties and compliance statuses.</p>
                </motion.div>

                {/* Portfolio Metrics */}
                <motion.div
                    className="grid grid-cols-1 md:grid-cols-3 gap-4"
                    variants={sectionVariants}
                    initial="hidden"
                    animate="visible"
                    custom={1}
                >
                    <MetricCard
                        label="Total Properties"
                        value={totalProperties.toString()}
                        subtitle="Active Units"
                        icon={<Building2 />}
                        iconColor="blue"
                    />
                    <MetricCard
                        label="Occupancy Rate"
                        value={`${occupancyRate}%`}
                        subtitle="Calculated Estimate"
                        icon={<Users />}
                        iconColor="green"
                    />
                    <MetricCard
                        label="Total Arrears"
                        value="₦0.00"
                        subtitle="All Clear"
                        icon={<Wallet />}
                        iconColor="orange"
                    />
                </motion.div>

                {/* Main Widgets */}
                <motion.div
                    className="grid grid-cols-1 lg:grid-cols-3 gap-6"
                    variants={sectionVariants}
                    initial="hidden"
                    animate="visible"
                    custom={2}
                >
                    <div className="lg:col-span-2">
                        <PropertyPortfolioCard properties={portfolioProperties} />
                    </div>
                    <div className="space-y-6">
                        <ComplianceStatusWidget
                            compliancePercentage={100}
                            outstandingProperties={0}
                            totalProperties={totalProperties}
                        />

                        {/* Quick Action Placeholder */}
                        <div className="rounded-xl border bg-card p-4 space-y-3">
                            <h4 className="font-medium text-sm">Quick Actions</h4>
                            <button className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-md transition-colors flex items-center gap-2">
                                <Wallet className="w-4 h-4 text-primary" />
                                Bulk Pay Levies
                            </button>
                            <button className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-md transition-colors flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-primary" />
                                Log Maintenance
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Right Sidebar (Desktop) */}
            <div className="hidden lg:block space-y-6">
                {/* Reusing existing components or new ones? 
            For now, let's put a placeholder for a "Recent Activities" or "Tenant Requests" feed
        */}
                <div className="bg-muted/30 rounded-xl p-4 min-h-[200px] flex items-center justify-center text-muted-foreground text-sm border border-dashed">
                    Recent Activity Feed
                    <br />(Coming Soon)
                </div>
            </div>
        </div>
    );
}

function PortfolioDashboardSkeleton() {
    return (
        <div className="space-y-8">
            <Skeleton className="h-8 w-64" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-32 rounded-xl" />
                ))}
            </div>
            <div className="grid grid-cols-3 gap-6">
                <Skeleton className="col-span-2 h-64 rounded-xl" />
                <Skeleton className="h-64 rounded-xl" />
            </div>
        </div>
    );
}
