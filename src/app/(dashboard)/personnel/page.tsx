'use client';

import { Users } from 'lucide-react';
import { PersonnelList } from '@/components/personnel/personnel-list';
import {
    EnhancedPageHeader,
    EnhancedTableCard,
} from '@/components/dashboard/enhanced-stat-card';

export default function PersonnelPage() {
    return (
        <div className="space-y-6">
            <EnhancedPageHeader
                title="Personnel & Vendors"
                description="Manage estate staff, contractors, vendors, and suppliers."
                icon={Users}
            />

            {/* Main Content */}
            <EnhancedTableCard
                title="Directory"
                description="All registered personnel and service providers"
            >
                <PersonnelList />
            </EnhancedTableCard>
        </div>
    );
}
