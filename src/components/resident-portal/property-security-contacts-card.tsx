'use client';

import * as React from 'react';
import Link from 'next/link';
import { Shield, Phone, ArrowRight, Plus, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { SecurityContact } from '@/types/database';

/**
 * Property Security Contacts Card Component
 *
 * Displays max 5 active security contacts for the current property.
 * Shows contact name, category badge, phone number, and status.
 *
 * Features:
 * - Filter to show only property-specific contacts
 * - Category badge with color coding
 * - "Manage Contacts" link (conditional for primary residents)
 * - Empty state for no contacts
 * - Phone number with click-to-call
 */

interface PropertySecurityContactsCardProps {
  /** Active security contacts for this property */
  contacts: SecurityContact[];
  /** Loading state */
  isLoading?: boolean;
  /** Whether user can manage contacts (primary resident) */
  canManage?: boolean;
  /** Property ID for "Manage" link */
  houseId: string;
  className?: string;
}

export function PropertySecurityContactsCard({
  contacts,
  isLoading = false,
  canManage = false,
  houseId,
  className,
}: PropertySecurityContactsCardProps) {
  // Get category badge variant based on category name
  const getCategoryVariant = (category: string | null) => {
    if (!category) return 'secondary';

    const lower = category.toLowerCase();
    if (lower.includes('family')) return 'success';
    if (lower.includes('friend')) return 'info';
    if (lower.includes('vendor') || lower.includes('service')) return 'warning';
    if (lower.includes('emergency')) return 'error';

    return 'secondary';
  };

  if (isLoading) {
    return (
      <div
        className={cn(
          'rounded-lg p-6 border',
          'bg-card',
          className
        )}
        style={{
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (contacts.length === 0) {
    return (
      <div
        className={cn(
          'rounded-lg p-6 border',
          'bg-card',
          className
        )}
        style={{
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Shield
            style={{
              width: 'var(--icon-sm)',
              height: 'var(--icon-sm)',
              color: 'var(--color-text-primary)',
            }}
          />
          <h3
            className="font-semibold"
            style={{
              fontSize: 'var(--text-lg)',
              color: 'var(--color-text-primary)',
            }}
          >
            Security Contacts
          </h3>
        </div>
        <div className="text-center py-8">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{
              background: 'var(--color-bg-muted)',
            }}
          >
            <Shield
              style={{
                width: '24px',
                height: '24px',
                color: 'var(--color-text-muted)',
              }}
            />
          </div>
          <p
            className="mb-1"
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {canManage
              ? 'No active security contacts yet'
              : 'No security contacts configured'}
          </p>
          {canManage && (
            <Button
              size="sm"
              variant="outline"
              asChild
              className="mt-3"
            >
              <Link href="/portal/security">
                <Plus className="w-4 h-4 mr-1" />
                Add Contact
              </Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg p-6 border',
        'bg-card',
        className
      )}
      style={{
        borderColor: 'var(--color-border)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield
            style={{
              width: 'var(--icon-sm)',
              height: 'var(--icon-sm)',
              color: 'var(--color-text-primary)',
            }}
          />
          <h3
            className="font-semibold"
            style={{
              fontSize: 'var(--text-lg)',
              color: 'var(--color-text-primary)',
            }}
          >
            Security Contacts
          </h3>
        </div>
        <Badge
          variant="secondary"
          style={{
            fontSize: 'var(--text-xs)',
          }}
        >
          {contacts.length}
        </Badge>
      </div>

      {/* Contact List */}
      <div className="space-y-3">
        {contacts.map((contact) => (
          <div
            key={contact.id}
            className={cn(
              'flex items-center justify-between gap-4 p-3 rounded-lg',
              'transition-colors'
            )}
            style={{
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-card)',
            }}
          >
            {/* Contact Avatar + Info */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: 'var(--color-bg-muted)',
                }}
              >
                <User
                  style={{
                    width: '20px',
                    height: '20px',
                    color: 'var(--color-text-muted)',
                  }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="font-medium truncate"
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {contact.contact_name}
                </p>
                {contact.phone_number && (
                  <a
                    href={`tel:${contact.phone_number}`}
                    className="text-xs hover:underline flex items-center gap-1"
                    style={{
                      color: 'var(--color-text-muted)',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Phone className="w-3 h-3" />
                    {contact.phone_number}
                  </a>
                )}
              </div>
            </div>

            {/* Category Badge */}
            {contact.category && (
              <Badge
                variant={getCategoryVariant(contact.category)}
                className="text-xs shrink-0"
              >
                {contact.category}
              </Badge>
            )}
          </div>
        ))}
      </div>

      {/* Manage Link */}
      {canManage && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <Link
            href="/portal/security"
            className="flex items-center justify-between text-sm hover:underline"
            style={{ color: 'var(--color-primary)' }}
          >
            <span>Manage Security Contacts</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
