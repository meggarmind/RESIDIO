'use client';

import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth/auth-provider';
import { useResident } from '@/hooks/use-residents';
import { Building, Home, MapPin, User } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

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

export default function PropertiesPage() {
  const { residentId } = useAuth();
  const { data: resident, isLoading } = useResident(residentId || undefined);

  // Filter active property assignments
  const properties = resident?.resident_houses?.filter(rh => rh.is_active) || [];

  if (isLoading) {
    return <PropertiesSkeleton />;
  }

  return (
    <div className="space-y-8 pb-10">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
      >
        <h1 className="text-[28px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>My Properties</h1>
        <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
          View all properties where you are assigned
        </p>
      </motion.div>

      {/* Properties Grid */}
      {properties.length === 0 ? (
        <motion.div
          className="rounded-2xl p-12 text-center"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderWidth: '1px',
            borderColor: 'var(--border-default)',
          }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={spring}
        >
          <Building className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-secondary)' }} />
          <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No Properties Assigned</h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            You don't have any active property assignments.
          </p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {properties.map((rh, index) => {
            const house = rh.house;
            if (!house) return null;

            return (
              <Link key={rh.id} href={`/portal/properties/${house.id}`}>
                <motion.div
                  className="rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:-translate-y-1 hover:shadow-md transition-all duration-200 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderWidth: '1px',
                    borderColor: 'var(--border-default)',
                  }}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  custom={index}
                >
                  {/* Property Icon */}
                  <div
                    className="h-12 w-12 flex items-center justify-center rounded-full mb-4"
                    style={{ backgroundColor: 'var(--bg-secondary)' }}
                  >
                    <Home className="h-6 w-6" style={{ color: 'var(--text-primary)' }} />
                  </div>

                  {/* Property Details */}
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {house.short_name || house.house_number}
                      </h3>
                      {house.house_number && house.short_name && (
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          House #{house.house_number}
                        </p>
                      )}
                    </div>

                    {/* Address */}
                    {house.street && (
                      <div className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>{house.street.name}</span>
                      </div>
                    )}

                    {/* House Type */}
                    {house.house_type && (
                      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <Building className="h-4 w-4 flex-shrink-0" />
                        <span>{house.house_type.name}</span>
                      </div>
                    )}

                    {/* Role Badge */}
                    <div className="pt-2 flex items-center justify-between">
                      <Badge
                        variant={rh.resident_role?.includes('landlord') ? 'default' : 'secondary'}
                        className="capitalize"
                      >
                        {rh.resident_role?.replace(/_/g, ' ') || 'Resident'}
                      </Badge>

                      {rh.move_in_date && (
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          Since {new Date(rh.move_in_date).toLocaleDateString('en-US', {
                            month: 'short',
                            year: 'numeric'
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PropertiesSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-64" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-64 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
