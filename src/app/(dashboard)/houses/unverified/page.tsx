'use client';

import { HelpCircle } from 'lucide-react';

import {
  EnhancedPageHeader,
  EnhancedTableCard,
} from '@/components/dashboard/enhanced-stat-card';
import { UnverifiedIdentifiersTable } from '@/components/houses/unverified-identifiers-table';

/**
 * Issue #119 -- the remediation view for doubted house identifiers.
 *
 * Route permission comes from the `/houses` entry in `ROUTE_PERMISSIONS`:
 * middleware matches protected routes by prefix, so this page already requires
 * `houses.view`. The confirm action inside the table is separately gated on
 * `houses.update`.
 */
export default function UnverifiedIdentifiersPage() {
  return (
    <div className="space-y-6">
      <EnhancedPageHeader
        title="Unconfirmed identifiers"
        description="Houses recorded from the manual register with a doubted house number, awaiting confirmation"
        icon={HelpCircle}
        backHref="/houses"
        backLabel="Back to houses"
      />

      <EnhancedTableCard className="[&>div]:pt-4">
        <UnverifiedIdentifiersTable />
      </EnhancedTableCard>
    </div>
  );
}
