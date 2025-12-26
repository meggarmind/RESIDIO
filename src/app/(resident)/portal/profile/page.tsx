'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { useResident } from '@/hooks/use-residents';
import { useResidentPreferences, useUpdateResidentPreference } from '@/hooks/use-notifications';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  User,
  Mail,
  Phone,
  Home,
  Building2,
  MapPin,
  Key,
  Bell,
  Shield,
  Copy,
  ChevronRight,
  CheckCircle2,
  Calendar,
  CreditCard,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { ResidentWithHouses, HouseWithStreet, ResidentRole } from '@/types/database';

// Type for resident houses with joined house data
type ResidentHouseWithDetails = {
  id: string;
  resident_id: string;
  house_id: string;
  resident_role: ResidentRole;
  move_in_date: string;
  move_out_date: string | null;
  is_active: boolean;
  house: HouseWithStreet;
};

// Role display labels
const roleLabels: Record<string, string> = {
  resident_landlord: 'Owner (Resident)',
  non_resident_landlord: 'Owner (Non-Resident)',
  tenant: 'Tenant',
  developer: 'Developer',
  co_resident: 'Co-Resident',
  household_member: 'Household Member',
  domestic_staff: 'Staff',
  caretaker: 'Caretaker',
};

/**
 * Resident Portal Profile Page
 *
 * Shows:
 * - Resident information (name, code, contact)
 * - Properties list with roles
 * - Notification preferences
 */
export default function ResidentProfilePage() {
  const { residentId, profile } = useAuth();
  const { data: resident, isLoading: residentLoading } = useResident(residentId || undefined);
  const { data: preferences, isLoading: preferencesLoading } = useResidentPreferences(residentId || '');
  const [selectedProperty, setSelectedProperty] = useState<ResidentHouseWithDetails | null>(null);

  const isLoading = residentLoading || preferencesLoading;

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  if (!resident) {
    return (
      <div className="py-8 text-center">
        <p className="text-muted-foreground">Profile not found</p>
      </div>
    );
  }

  // Get active properties (cast to our detailed type)
  const activeProperties = (resident.resident_houses?.filter(rh => rh.is_active) || []) as ResidentHouseWithDetails[];

  // Copy resident code
  const copyCode = () => {
    if (resident.resident_code) {
      navigator.clipboard.writeText(resident.resident_code);
      toast.success('Resident code copied');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground">Your account information</p>
      </div>

      {/* Resident Info Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-xl font-semibold text-primary">
                {resident.first_name?.[0]}{resident.last_name?.[0]}
              </span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold truncate">
                {resident.first_name} {resident.last_name}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="font-mono">
                  {resident.resident_code}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={copyCode}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Verified Resident</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Contact Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {resident.email && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm font-medium truncate">{resident.email}</p>
              </div>
            </div>
          )}

          {resident.phone_primary && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Phone</p>
                <p className="text-sm font-medium">{resident.phone_primary}</p>
              </div>
            </div>
          )}

          {resident.phone_secondary && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Alternative Phone</p>
                <p className="text-sm font-medium">{resident.phone_secondary}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Properties */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Home className="h-4 w-4" />
            My Properties
          </CardTitle>
          <CardDescription>Properties you are linked to</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {activeProperties.length === 0 ? (
            <div className="py-4 text-center text-muted-foreground text-sm">
              No properties linked
            </div>
          ) : (
            activeProperties.map((property) => (
              <PropertyCard
                key={property.id}
                property={property}
                onClick={() => setSelectedProperty(property)}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </CardTitle>
          <CardDescription>Manage how you receive updates</CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationPreferences
            residentId={residentId || ''}
            preferences={preferences || []}
          />
        </CardContent>
      </Card>

      {/* Property Detail Sheet */}
      <PropertyDetailSheet
        property={selectedProperty}
        open={!!selectedProperty}
        onOpenChange={(open) => !open && setSelectedProperty(null)}
      />
    </div>
  );
}

// Property Card Component
function PropertyCard({
  property,
  onClick,
}: {
  property: ResidentHouseWithDetails;
  onClick: () => void;
}) {
  const house = property.house;

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:border-primary/30 transition-colors"
      onClick={onClick}
    >
      <div className="p-2 rounded-lg bg-blue-500/10 shrink-0">
        <Building2 className="h-4 w-4 text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">
          {house?.house_number}, {house?.street?.name}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge variant="outline" className="text-[10px]">
            {roleLabels[property.resident_role] || property.resident_role}
          </Badge>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </div>
  );
}

// Property Detail Sheet
function PropertyDetailSheet({
  property,
  open,
  onOpenChange,
}: {
  property: ResidentHouseWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!property) return null;

  const house = property.house;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[70vh] rounded-t-3xl">
        <SheetHeader className="text-left pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {house?.house_number}
          </SheetTitle>
          <SheetDescription>
            {house?.street?.name}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          {/* Role Badge */}
          <Badge variant="secondary">
            {roleLabels[property.resident_role] || property.resident_role}
          </Badge>

          {/* Property Details */}
          <div className="space-y-3">
            {house?.house_type && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Home className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Property Type</p>
                  <p className="text-sm font-medium">{house.house_type.name}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Address</p>
                <p className="text-sm font-medium">
                  {house?.house_number}, {house?.street?.name}
                </p>
              </div>
            </div>

            {property.move_in_date && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Move-in Date</p>
                  <p className="text-sm font-medium">
                    {format(new Date(property.move_in_date), 'MMMM d, yyyy')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Notification Preferences Component
function NotificationPreferences({
  residentId,
  preferences,
}: {
  residentId: string;
  preferences: Array<{
    id: string;
    category: string;
    channel: string;
    enabled: boolean;
  }>;
}) {
  const updatePreference = useUpdateResidentPreference();

  // Categories to show (must match NotificationCategory type: 'payment' | 'invoice' | 'security' | 'general')
  const categories = [
    { key: 'payment' as const, label: 'Payment Reminders', icon: Key },
    { key: 'invoice' as const, label: 'Invoice Notifications', icon: CreditCard },
    { key: 'security' as const, label: 'Security Alerts', icon: Shield },
    { key: 'general' as const, label: 'General Updates', icon: Bell },
  ];

  // Get email preference for a category
  const getEmailPreference = (category: string) => {
    return preferences.find(p => p.category === category && p.channel === 'email');
  };

  const handleToggle = async (category: 'payment' | 'invoice' | 'security' | 'general', enabled: boolean) => {
    try {
      await updatePreference.mutateAsync({
        resident_id: residentId,
        category,
        channel: 'email',
        enabled,
      });
      toast.success(enabled ? 'Notifications enabled' : 'Notifications disabled');
    } catch (error) {
      toast.error('Failed to update preference');
    }
  };

  return (
    <div className="space-y-3">
      {categories.map(({ key, label, icon: Icon }) => {
        const pref = getEmailPreference(key);
        const isEnabled = pref?.enabled ?? true;

        return (
          <div
            key={key}
            className="flex items-center justify-between p-3 rounded-lg border"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">
                  {isEnabled ? 'Email notifications on' : 'Notifications off'}
                </p>
              </div>
            </div>
            <Switch
              checked={isEnabled}
              onCheckedChange={(checked) => handleToggle(key, checked)}
              disabled={updatePreference.isPending}
            />
          </div>
        );
      })}

      <p className="text-xs text-muted-foreground pt-2">
        SMS and WhatsApp notifications coming soon
      </p>
    </div>
  );
}

// Skeleton
function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>

      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}
