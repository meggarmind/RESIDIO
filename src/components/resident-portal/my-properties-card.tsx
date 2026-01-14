'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Home, MapPin, Building } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * My Properties Card Component (Dashboard Widget)
 *
 * Displays property cards directly on the dashboard with smart routing:
 * - 1 property: Click navigates directly to property detail page
 * - 2+ properties: Click navigates to properties list page
 * - Max 4 properties shown on dashboard (progressive disclosure)
 *
 * Features:
 * - Smart routing based on property count
 * - Responsive grid (1 column for 1-2 properties, 2 columns for 3+)
 * - Compact design (p-4) optimized for dashboard density
 * - Stagger animations with spring physics
 * - Empty state handling
 */

interface MyPropertiesCardProps {
  /** Active property assignments for current resident */
  properties: Array<{
    id: string;
    house: {
      id: string;
      short_name?: string | null;
      house_number?: string | null;
      street?: { name: string } | null;
      house_type?: { name: string } | null;
    } | null;
    resident_role?: string | null;
    move_in_date?: string | null;
    is_active: boolean;
  }>;
  /** Total property count (including those not displayed) */
  totalPropertyCount: number;
  /** Loading state */
  isLoading?: boolean;
  className?: string;
}

// Spring physics for smooth animations
const spring = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
  mass: 1,
};

// Card animation variants with stagger
const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (custom: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      ...spring,
      delay: custom * 0.1, // 100ms stagger between cards
    },
  }),
};

export function MyPropertiesCard({
  properties,
  totalPropertyCount,
  isLoading = false,
  className,
}: MyPropertiesCardProps) {
  if (isLoading) {
    return <PropertiesLoadingSkeleton className={className} />;
  }

  // Empty state
  if (properties.length === 0) {
    return (
      <div
        className={cn(
          'rounded-2xl p-8 text-center',
          className
        )}
        style={{
          backgroundColor: 'var(--card)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
        }}
      >
        <Building
          className="h-12 w-12 mx-auto mb-4"
          style={{ color: 'var(--muted-foreground)' }}
        />
        <h3
          className="text-base font-semibold mb-2"
          style={{ color: 'var(--foreground)' }}
        >
          No Active Property Assignments
        </h3>
        <p
          className="text-sm"
          style={{ color: 'var(--muted-foreground)' }}
        >
          You don't have any active property assignments yet.
        </p>
      </div>
    );
  }

  // Smart routing logic:
  // - 1 property: Link directly to property detail page
  // - 2+ properties: Link to properties list page
  const isSingleProperty = totalPropertyCount === 1;

  // Determine grid columns based on property count
  const gridCols = properties.length <= 2 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2';

  // Check if themed styling is applied (parent has themed class)
  const isThemed = className?.includes('themed-properties');

  return (
    <div className={cn('grid gap-3', gridCols, className)}>
      {properties.map((rh, index) => {
        const house = rh.house;
        if (!house) return null;

        // Smart routing: single property goes to detail, multiple goes to list
        const href = isSingleProperty
          ? `/portal/properties/${house.id}`
          : '/portal/properties';

        return (
          <Link key={rh.id} href={href}>
            <motion.div
              className={cn(
                'rounded-xl p-3 shadow-[0_1px_3px_rgba(0,0,0,0.05)]',
                'hover:-translate-y-1 hover:shadow-md',
                'transition-all duration-200 cursor-pointer',
                isThemed && 'bg-white/10 border-white/20 backdrop-blur-sm'
              )}
              style={
                isThemed
                  ? {
                    borderWidth: '1px',
                  }
                  : {
                    backgroundColor: 'var(--card)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                  }
              }
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              custom={index}
            >
              {/* Property Icon */}
              <div
                className={cn(
                  'h-10 w-10 flex items-center justify-center rounded-full mb-3',
                  isThemed && 'bg-white/20'
                )}
                style={!isThemed ? { backgroundColor: 'var(--secondary)' } : undefined}
              >
                <Home
                  className="h-5 w-5"
                  style={{ color: isThemed ? 'var(--primary-foreground)' : 'var(--foreground)' }}
                />
              </div>

              {/* Property Details */}
              <div className="space-y-2">
                {/* Property Name */}
                <div>
                  <h3
                    className="text-sm font-semibold"
                    style={{ color: isThemed ? 'var(--primary-foreground)' : 'var(--foreground)' }}
                  >
                    {house.short_name || house.house_number}
                  </h3>
                  {house.house_number && house.short_name && (
                    <p
                      className="text-xs"
                      style={{ color: isThemed ? 'var(--primary-foreground)' : 'var(--muted-foreground)' }}
                    >
                      House #{house.house_number}
                    </p>
                  )}
                </div>

                {/* Address */}
                {house.street && (
                  <div
                    className="flex items-start gap-2 text-xs"
                    style={{ color: isThemed ? 'var(--primary-foreground)' : 'var(--muted-foreground)' }}
                  >
                    <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    <span className="line-clamp-1">{house.street.name}</span>
                  </div>
                )}

                {/* House Type */}
                {house.house_type && (
                  <div
                    className="flex items-center gap-2 text-xs"
                    style={{ color: isThemed ? 'var(--primary-foreground)' : 'var(--muted-foreground)' }}
                  >
                    <Building className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{house.house_type.name}</span>
                  </div>
                )}

                {/* Role Badge & Move-in Date */}
                <div className="pt-1 flex items-center justify-between gap-2">
                  <Badge
                    variant={
                      rh.resident_role?.includes('landlord')
                        ? 'default'
                        : 'secondary'
                    }
                    className={cn(
                      'capitalize text-xs',
                      isThemed && 'bg-white/20 text-white border-white/30'
                    )}
                  >
                    {rh.resident_role?.replace(/_/g, ' ') || 'Resident'}
                  </Badge>

                  {rh.move_in_date && (
                    <span
                      className="text-xs whitespace-nowrap"
                      style={{ color: isThemed ? 'var(--primary-foreground)' : 'var(--muted-foreground)' }}
                    >
                      Since{' '}
                      {new Date(rh.move_in_date).toLocaleDateString('en-US', {
                        month: 'short',
                        year: 'numeric',
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
  );
}

function PropertiesLoadingSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 gap-4', className)}>
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-48 rounded-2xl" />
      ))}
    </div>
  );
}
