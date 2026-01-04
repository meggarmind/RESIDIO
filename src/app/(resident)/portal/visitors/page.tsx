'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth/auth-provider';
import { useResidentSecurityContacts } from '@/hooks/use-security';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { VisitorAccessDialog } from '@/components/resident-portal/visitor-access-dialog';
import { UserPlus, Phone, Car, Calendar } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// Spring physics for smooth animations
const spring = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
  mass: 1,
};

// Card animation variants
const cardVariants = {
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

export default function VisitorsPage() {
  const { residentId } = useAuth();
  const { data: contactsData, isLoading } = useResidentSecurityContacts(residentId || undefined);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Filter for visitors only
  const visitors = contactsData?.data?.filter(c =>
    c.category?.name?.toLowerCase() === 'visitor'
  ) || [];

  if (isLoading) {
    return <VisitorsSkeleton />;
  }

  return (
    <div className="space-y-8 pb-10">
      {/* Page Header */}
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
      >
        <div>
          <h1 className="text-[28px] font-bold text-bill-text tracking-tight">Visitors</h1>
          <p className="text-bill-text-secondary mt-1">
            Manage visitor access codes and permissions
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Add Visitor
        </Button>
      </motion.div>

      {/* Visitors Grid */}
      {visitors.length === 0 ? (
        <motion.div
          className="bg-bill-card border border-border rounded-2xl p-12 text-center"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={spring}
        >
          <UserPlus className="h-12 w-12 text-bill-text-secondary mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-bill-text mb-2">No Visitors Yet</h3>
          <p className="text-sm text-bill-text-secondary mb-4">
            Create visitor access codes to grant temporary access to your guests.
          </p>
          <Button onClick={() => setDialogOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add First Visitor
          </Button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visitors.map((visitor, index) => (
            <motion.div
              key={visitor.id}
              className="bg-bill-card border border-border rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:-translate-y-1 transition-transform duration-200"
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              custom={index}
            >
              {/* Visitor Name & Status */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-bill-text">
                    {visitor.full_name}
                  </h3>
                  <p className="text-sm text-bill-text-secondary capitalize">
                    {visitor.relationship || 'Visitor'}
                  </p>
                </div>
                <Badge
                  variant={visitor.status === 'active' ? 'default' : 'secondary'}
                  className="capitalize"
                >
                  {visitor.status}
                </Badge>
              </div>

              {/* Contact Details */}
              <div className="space-y-2 mb-4">
                {visitor.phone_primary && (
                  <div className="flex items-center gap-2 text-sm text-bill-text-secondary">
                    <Phone className="h-4 w-4 flex-shrink-0" />
                    <span>{visitor.phone_primary}</span>
                  </div>
                )}

                {visitor.phone_secondary && (
                  <div className="flex items-center gap-2 text-sm text-bill-text-secondary">
                    <Car className="h-4 w-4 flex-shrink-0" />
                    <span>{visitor.phone_secondary}</span>
                  </div>
                )}

                {visitor.created_at && (
                  <div className="flex items-center gap-2 text-sm text-bill-text-secondary">
                    <Calendar className="h-4 w-4 flex-shrink-0" />
                    <span>
                      Added {formatDistanceToNow(new Date(visitor.created_at), { addSuffix: true })}
                    </span>
                  </div>
                )}
              </div>

              {/* Notes */}
              {visitor.notes && (
                <div className="pt-3 border-t border-border">
                  <p className="text-xs text-bill-text-secondary">
                    {visitor.notes}
                  </p>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Add Visitor Dialog */}
      <VisitorAccessDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}

function VisitorsSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-64" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-64 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
