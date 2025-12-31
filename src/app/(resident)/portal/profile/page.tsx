'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { useResident } from '@/hooks/use-residents';
import { useResidentPreferences, useUpdateResidentPreference } from '@/hooks/use-notifications';
import { useIsDesktop } from '@/hooks/use-media-query';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  ResponsiveSheet,
  ResponsiveSheetHeader,
  ResponsiveSheetTitle,
  ResponsiveSheetDescription,
  ResponsiveSheetBody,
} from '@/components/ui/responsive-sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
  Users,
  Trash2,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useLayoutTheme } from '@/contexts/layout-theme-context';
import { HouseholdMemberForm } from '@/components/resident-portal/household-member-form';
import { ContactVerificationCard } from '@/components/resident-portal/contact-verification-card';
import { getHouseholdMembers, removeHouseholdMember } from '@/actions/residents/add-household-member';
import type { ResidentWithHouses, HouseWithStreet, ResidentRole } from '@/types/database';

// Type for resident houses with joined house data
type ResidentHouseWithDetails = {
  id: string;
  resident_id: string;
  house_id: string;
  resident_role: ResidentRole;
  is_primary: boolean;
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
  contractor: 'Contractor',
};

// Role color classes for badges (with dark mode support)
const roleColors: Record<string, string> = {
  resident_landlord: 'bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-800',
  non_resident_landlord: 'bg-purple-500/10 text-purple-700 border-purple-200 dark:text-purple-400 dark:border-purple-800',
  tenant: 'bg-green-500/10 text-green-700 border-green-200 dark:text-green-400 dark:border-green-800',
  household_member: 'bg-gray-500/10 text-gray-700 border-gray-200 dark:text-gray-400 dark:border-gray-700',
  domestic_staff: 'bg-teal-500/10 text-teal-700 border-teal-200 dark:text-teal-400 dark:border-teal-800',
  contractor: 'bg-amber-500/10 text-amber-700 border-amber-200 dark:text-amber-400 dark:border-amber-800',
  caretaker: 'bg-indigo-500/10 text-indigo-700 border-indigo-200 dark:text-indigo-400 dark:border-indigo-800',
  co_resident: 'bg-cyan-500/10 text-cyan-700 border-cyan-200 dark:text-cyan-400 dark:border-cyan-800',
  developer: 'bg-rose-500/10 text-rose-700 border-rose-200 dark:text-rose-400 dark:border-rose-800',
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
  const isDesktop = useIsDesktop();
  const { isExpanded } = useLayoutTheme();

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

  // Find primary property (where user can manage household members)
  const primaryProperty = (resident.resident_houses?.find(rh => rh.is_active && rh.is_primary) || null) as ResidentHouseWithDetails | null;

  // Copy resident code
  const copyCode = () => {
    if (resident.resident_code) {
      navigator.clipboard.writeText(resident.resident_code);
      toast.success('Resident code copied');
    }
  };

  // Desktop: Two-column layout (1/3 + 2/3)
  // Mobile: Stacked layout
  return (
    <div className={cn('space-y-6', isExpanded && 'space-y-8')}>
      {/* Header */}
      <div className="space-y-1">
        <h1 className={cn(
          'text-2xl font-bold tracking-tight',
          isExpanded && 'text-3xl xl:text-4xl'
        )}>My Profile</h1>
        <p className={cn(
          'text-muted-foreground',
          isExpanded && 'text-base'
        )}>Your account information</p>
      </div>

      <div className={cn(
        isDesktop && 'flex gap-6'
      )}>
        {/* Left Column (Desktop) / Full width (Mobile) */}
        <div className={cn(
          'space-y-6',
          isDesktop && 'w-1/3 shrink-0'
        )}>
          {/* Resident Info Card */}
          <Card>
            <CardContent className={cn('p-4', isDesktop && 'p-6')}>
              <div className={cn(
                'flex items-start gap-4',
                isDesktop && 'flex-col items-center text-center'
              )}>
                {/* Avatar */}
                <div className={cn(
                  'rounded-full bg-primary/10 flex items-center justify-center shrink-0',
                  isDesktop ? 'w-24 h-24' : 'w-16 h-16',
                  isExpanded && 'xl:w-32 xl:h-32'
                )}>
                  <span className={cn(
                    'font-semibold text-primary',
                    isDesktop ? 'text-3xl' : 'text-xl'
                  )}>
                    {resident.first_name?.[0]}{resident.last_name?.[0]}
                  </span>
                </div>

                {/* Info */}
                <div className={cn('flex-1 min-w-0', isDesktop && 'w-full')}>
                  <h2 className={cn(
                    'font-semibold truncate',
                    isDesktop ? 'text-xl' : 'text-lg'
                  )}>
                    {resident.first_name} {resident.last_name}
                  </h2>
                  <div className={cn(
                    'flex items-center gap-2 mt-1',
                    isDesktop && 'justify-center'
                  )}>
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
                  <div className={cn(
                    'flex items-center gap-1 mt-2 text-xs text-muted-foreground',
                    isDesktop && 'justify-center'
                  )}>
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

          {/* Contact Verification */}
          {residentId && (
            <ContactVerificationCard
              residentId={residentId}
              email={resident.email}
              phone={resident.phone_primary}
            />
          )}
        </div>

        {/* Right Column (Desktop) / Continue stacked (Mobile) */}
        <div className={cn(
          'space-y-6',
          isDesktop ? 'flex-1' : 'mt-6'
        )}>
          {/* Properties */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Home className="h-4 w-4" />
                My Properties
              </CardTitle>
              <CardDescription>Properties you are linked to</CardDescription>
            </CardHeader>
            <CardContent className={cn(
              isDesktop ? 'grid gap-3 grid-cols-1 lg:grid-cols-2' : 'space-y-2',
              isExpanded && 'xl:grid-cols-3'
            )}>
              {activeProperties.length === 0 ? (
                <div className="py-4 text-center text-muted-foreground text-sm col-span-full">
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

          {/* Household Members - Only show if user is primary resident */}
          {primaryProperty && (
            <HouseholdMembersCard
              houseId={primaryProperty.house_id}
              houseName={`${primaryProperty.house?.house_number}, ${primaryProperty.house?.street?.name}`}
              isDesktop={isDesktop}
              isExpanded={isExpanded}
            />
          )}

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
                isDesktop={isDesktop}
                isExpanded={isExpanded}
              />
            </CardContent>
          </Card>
        </div>
      </div>

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
          <Badge
            variant="outline"
            className={cn("text-[10px]", roleColors[property.resident_role])}
          >
            {roleLabels[property.resident_role] || property.resident_role}
          </Badge>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </div>
  );
}

// Property Detail Sheet (uses ResponsiveSheet for desktop drawer)
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
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      variant="drawer"
      drawerWidth="md"
      mobileHeight="h-[70vh]"
    >
      <ResponsiveSheetHeader>
        <ResponsiveSheetTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          {house?.house_number}
        </ResponsiveSheetTitle>
        <ResponsiveSheetDescription>
          {house?.street?.name}
        </ResponsiveSheetDescription>
      </ResponsiveSheetHeader>

      <ResponsiveSheetBody className="space-y-4">
        {/* Role Badge */}
        <Badge
          variant="outline"
          className={cn("text-sm", roleColors[property.resident_role])}
        >
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
      </ResponsiveSheetBody>
    </ResponsiveSheet>
  );
}

// Household Members Card Component
function HouseholdMembersCard({
  houseId,
  houseName,
  isDesktop = false,
  isExpanded = false,
}: {
  houseId: string;
  houseName: string;
  isDesktop?: boolean;
  isExpanded?: boolean;
}) {
  const queryClient = useQueryClient();

  // Fetch household members
  const { data: membersData, isLoading } = useQuery({
    queryKey: ['householdMembers', houseId],
    queryFn: () => getHouseholdMembers(houseId),
    enabled: !!houseId,
  });

  // Remove mutation
  const removeMutation = useMutation({
    mutationFn: removeHouseholdMember,
    onSuccess: () => {
      toast.success('Member removed');
      queryClient.invalidateQueries({ queryKey: ['householdMembers', houseId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove member');
    },
  });

  const members = membersData?.data || [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Household Members
            </CardTitle>
            <CardDescription>People linked to your property</CardDescription>
          </div>
          <HouseholdMemberForm houseId={houseId} houseName={houseName} />
        </div>
      </CardHeader>
      <CardContent className={cn(
        isDesktop ? 'grid gap-3 grid-cols-1 lg:grid-cols-2' : 'space-y-2',
        isExpanded && 'xl:grid-cols-3 gap-4'
      )}>
        {isLoading ? (
          <div className={cn(isDesktop ? 'col-span-full grid gap-2 grid-cols-2' : 'space-y-2', isExpanded && 'grid-cols-3')}>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : members.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground text-sm col-span-full">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No household members added</p>
            <p className="text-xs mt-1">Add family members, contractors, or staff</p>
          </div>
        ) : (
          members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 p-3 rounded-lg border"
            >
              <div className="p-2 rounded-full bg-muted">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">
                  {member.resident?.first_name} {member.resident?.last_name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge
                    variant="outline"
                    className={cn("text-[10px]", roleColors[member.resident_role])}
                  >
                    {roleLabels[member.resident_role] || member.resident_role}
                  </Badge>
                  {member.resident?.phone_primary && (
                    <span className="text-xs text-muted-foreground">
                      {member.resident.phone_primary}
                    </span>
                  )}
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    disabled={removeMutation.isPending}
                  >
                    {removeMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove household member?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove {member.resident?.first_name} {member.resident?.last_name} from your household.
                      They will no longer have access tied to your property.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => removeMutation.mutate(member.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// Notification Preferences Component
function NotificationPreferences({
  residentId,
  preferences,
  isDesktop = false,
  isExpanded = false,
}: {
  residentId: string;
  preferences: Array<{
    id: string;
    category: string;
    channel: string;
    enabled: boolean;
  }>;
  isDesktop?: boolean;
  isExpanded?: boolean;
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
    <div className={cn(
      isDesktop ? 'grid gap-3 grid-cols-2' : 'space-y-3',
      isExpanded && 'xl:grid-cols-4 gap-4'
    )}>
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

      <p className={cn(
        'text-xs text-muted-foreground pt-2',
        isDesktop && 'col-span-full'
      )}>
        SMS and WhatsApp notifications coming soon
      </p>
    </div>
  );
}

// Skeleton
function ProfileSkeleton() {
  const isDesktop = useIsDesktop();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>

      <div className={cn(isDesktop && 'flex gap-6')}>
        {/* Left column skeleton */}
        <div className={cn('space-y-6', isDesktop && 'w-1/3 shrink-0')}>
          <Skeleton className={cn('w-full rounded-xl', isDesktop ? 'h-48' : 'h-28')} />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>

        {/* Right column skeleton */}
        <div className={cn('space-y-6', isDesktop ? 'flex-1' : 'mt-6')}>
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
