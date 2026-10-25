'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useHousesWithRoles, useHouseResidents } from '@/hooks/use-houses';
import { useCreateResident, useUpdateResident, useResidentOptions, DuplicateResidentError } from '@/hooks/use-residents';
import { DuplicateResidentDialog } from '@/components/residents/duplicate-resident-dialog';
import type { CreateResidentOptions } from '@/actions/residents/create-resident';
import type { DuplicateResidentMatch } from '@/lib/residents/duplicate-match';
import { createResidentSchema, resolveSubmittedCorporateFields, type CreateResidentData, type ResidentFormData, requiresSponsor, sponsorRolesFor, describeSponsorRoles } from '@/lib/validators/resident';
import { toast } from 'sonner';
import type { Resident, ResidentRole, EntityType } from '@/types/database';
import { PRIMARY_ROLE_OPTIONS, SECONDARY_ROLE_OPTIONS, CORPORATE_ROLE_OPTIONS, ENTITY_TYPE_LABELS, RESIDENT_ROLE_LABELS, RESIDENT_TYPE_LABELS } from '@/types/database';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { allowedResidentTypes, deriveHouseState } from '@/lib/residents/house-state';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { getCommsEnvironment } from '@/lib/comms-override/environment';
import {
  FLAG_OPTION_LABELS,
  REAL_RECIPIENT_WARNING,
  describeEnvironmentDefault,
  displayedFlag,
  flagToSubmit,
  selectValueToFlag,
} from '@/lib/comms-override/resident-flag-ui';

// Creating a resident is a wizard (#1135); editing keeps the single page.
type WizardStep = 'details' | 'house' | 'entity' | 'emergency' | 'comms' | 'notes';

const WIZARD_STEPS: { id: WizardStep; title: string; optional: boolean; fields: (keyof CreateResidentData)[] }[] = [
  { id: 'details', title: 'Personal Information', optional: false, fields: ['first_name', 'last_name', 'email', 'phone_primary', 'phone_secondary', 'resident_type'] },
  { id: 'house', title: 'House Assignment', optional: true, fields: ['house_id', 'resident_role', 'move_in_date', 'sponsor_resident_id'] },
  { id: 'entity', title: 'Entity Type', optional: true, fields: ['entity_type', 'company_name', 'rc_number', 'liaison_contact_name', 'liaison_contact_phone'] },
  { id: 'emergency', title: 'Emergency Contact', optional: true, fields: ['emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship', 'emergency_contact_resident_id'] },
  { id: 'comms', title: 'Communications', optional: true, fields: ['use_override_comms'] },
  { id: 'notes', title: 'Notes', optional: true, fields: ['notes'] },
];

interface ResidentFormProps {
  resident?: Resident;
  onSuccess?: () => void;
  preselectedHouseId?: string;
}

export function ResidentForm({ resident, onSuccess, preselectedHouseId }: ResidentFormProps) {
  const router = useRouter();
  const { hasPermission } = useAuth();
  // Communications override control (#716): hidden entirely without settings.manage_general. The
  // server enforces the same rule; this only decides whether the control is shown.
  const canManageOverride = hasPermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
  // The stored flag, read from the resident prop on every render. `use_override_comms` is not in the
  // generated Resident type until `npm run db:types` is re-run after the migration (#716 follow-up).
  const storedOverrideFlag = (resident as (Resident & { use_override_comms?: boolean | null }) | undefined)
    ?.use_override_comms;
  const { data: housesData, isLoading: housesLoading } = useHousesWithRoles({ limit: 100 });
  // Reduced limit - only used for emergency contact picker in linked mode
  const { data: residentsData, isLoading: residentsLoading } = useResidentOptions();
  const createMutation = useCreateResident();
  const updateMutation = useUpdateResident();

  const isEditing = !!resident;
  const isWizard = !isEditing;
  const steps = WIZARD_STEPS.filter((st) => st.id !== 'comms' || canManageOverride);
  const [stepIndex, setStepIndex] = React.useState(0);
  const currentStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;
  // Edit renders every section; the create wizard renders the current step only.
  const showStep = (id: WizardStep) => !isWizard || currentStep.id === id;
  const defaultContactMode = resident?.emergency_contact_resident_id ? 'linked' : 'manual';
  const [contactMode, setContactMode] = React.useState<'manual' | 'linked'>(defaultContactMode);

  // Determine if house is locked (coming from the house detail page)
  const isHouseLocked = !!preselectedHouseId;

  const form = useForm<CreateResidentData>({
    resolver: zodResolver(createResidentSchema),
    defaultValues: {
      first_name: resident?.first_name ?? '',
      last_name: resident?.last_name ?? '',
      email: resident?.email ?? '',
      phone_primary: resident?.phone_primary ?? '',
      phone_secondary: resident?.phone_secondary ?? '',
      resident_type: resident?.resident_type ?? 'primary',
      entity_type: resident?.entity_type ?? 'individual',
      company_name: resident?.company_name ?? '',
      rc_number: resident?.rc_number ?? '',
      liaison_contact_name: resident?.liaison_contact_name ?? '',
      liaison_contact_phone: resident?.liaison_contact_phone ?? '',
      emergency_contact_name: resident?.emergency_contact_name ?? '',
      emergency_contact_phone: resident?.emergency_contact_phone ?? '',
      emergency_contact_relationship: resident?.emergency_contact_relationship ?? '',
      emergency_contact_resident_id: resident?.emergency_contact_resident_id ?? undefined,
      notes: resident?.notes ?? '',
      // Left undefined until the user touches the control: the control shows the stored value
      // (storedOverrideFlag) on every render, and an untouched save sends nothing.
      use_override_comms: undefined,
      house_id: preselectedHouseId,
      resident_role: undefined,
      move_in_date: new Date().toISOString().split('T')[0],
      sponsor_resident_id: undefined,
    },
  });

  const isLoading = createMutation.isPending || updateMutation.isPending;
  // Set when the server found an existing resident matching the new one (#820); the admin chooses.
  const [duplicatePrompt, setDuplicatePrompt] = React.useState<{
    createData: CreateResidentData;
    matches: DuplicateResidentMatch[];
  } | null>(null);

  // Watch fields for conditional rendering
  const residentType = form.watch('resident_type');
  const residentRole = form.watch('resident_role');
  const entityType = form.watch('entity_type');
  const selectedHouseId = form.watch('house_id');

  // Fetch residents for selected house (used for sponsor selection)
  // This is much more efficient than fetching all 1000 residents
  const { data: houseResidents } = useHouseResidents(selectedHouseId);

  // The house state comes from the house's live residents, never from the URL. The server re-checks on submit.
  const onlySecondaryAllowed = React.useMemo(() => {
    if (!houseResidents || !residentRole) return false;
    const allowed = allowedResidentTypes(deriveHouseState(houseResidents.map((r) => r.resident_role)), residentRole);
    return allowed.length === 1 && allowed[0] === 'secondary';
  }, [houseResidents, residentRole]);

  // Role options filtered by resident type and entity type
  const availableRoles = React.useMemo(() => {
    if (residentType === 'secondary') {
      // Secondary residents must be individuals only
      if (entityType === 'corporate') {
        return []; // Corporate entities cannot be secondary residents
      }
      return SECONDARY_ROLE_OPTIONS;
    }
    // Primary residents
    if (entityType === 'corporate') {
      // Corporate entities may own, develop, or occupy a property as tenant.
      return CORPORATE_ROLE_OPTIONS;
    }
    return PRIMARY_ROLE_OPTIONS;
  }, [residentType, entityType]);

  // Enforce secondary resident type when house state restricts it
  React.useEffect(() => {
    if (onlySecondaryAllowed && residentType !== 'secondary') {
      form.setValue('resident_type', 'secondary');
    }
  }, [onlySecondaryAllowed, residentType, form]);

  // Reset role when resident type changes
  React.useEffect(() => {
    const currentRole = form.getValues('resident_role');
    const validRoles = availableRoles.map(r => r.value);
    if (currentRole && !validRoles.includes(currentRole as typeof validRoles[number])) {
      form.setValue('resident_role', undefined);
    }
    // Clear move-in date for secondary residents
    if (residentType === 'secondary') {
      form.setValue('move_in_date', undefined);
    }
    // Clear sponsor when switching to primary type
    if (residentType === 'primary') {
      form.setValue('sponsor_resident_id', undefined);
    }
  }, [residentType, availableRoles, form]);

  async function runCreate(createData: CreateResidentData, options?: CreateResidentOptions) {
    try {
      await createMutation.mutateAsync({ data: createData, options });
      setDuplicatePrompt(null);
      toast.success(options?.linkToResidentId ? 'House linked to existing resident' : 'Resident created successfully');
      onSuccess?.();
      router.push(preselectedHouseId ? `/houses/${preselectedHouseId}` : '/residents');
    } catch (error) {
      if (error instanceof DuplicateResidentError) {
        setDuplicatePrompt({ createData, matches: error.matches });
        return;
      }
      setDuplicatePrompt(null);
      toast.error(error instanceof Error ? error.message : 'An error occurred');
    }
  }

  async function onSubmit(data: CreateResidentData) {
    try {
      const submitted = resolveSubmittedCorporateFields(data);
      // Without the permission the field is never sent (the server would reject a change anyway).
      const overrideField = { use_override_comms: flagToSubmit(canManageOverride, submitted.use_override_comms) };
      if (isEditing) {
        const updateData: ResidentFormData = {
          first_name: submitted.first_name,
          last_name: submitted.last_name,
          email: submitted.email,
          phone_primary: submitted.phone_primary,
          phone_secondary: submitted.phone_secondary,
          resident_type: submitted.resident_type,
          entity_type: submitted.entity_type,
          company_name: submitted.company_name,
          rc_number: submitted.rc_number,
          liaison_contact_name: submitted.liaison_contact_name,
          liaison_contact_phone: submitted.liaison_contact_phone,
          emergency_contact_name: submitted.emergency_contact_name,
          emergency_contact_phone: submitted.emergency_contact_phone,
          emergency_contact_relationship: submitted.emergency_contact_relationship,
          emergency_contact_resident_id: submitted.emergency_contact_resident_id,
          notes: submitted.notes,
          ...overrideField,
        };
        await updateMutation.mutateAsync({ id: resident.id, data: updateData });
        toast.success('Resident updated successfully');
      } else {
        const createData = canManageOverride ? submitted : { ...submitted, use_override_comms: undefined };
        await runCreate(createData);
        return;
      }
      onSuccess?.();
      router.push('/residents');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'An error occurred');
    }
  }

  // Filter houses based on selected role
  const allHouses = housesData?.data ?? [];
  const availableHouses = React.useMemo(() => {
    if (!residentRole) {
      return allHouses;
    }
    // For resident_landlord and tenant, filter out houses that already have one
    if (residentRole === 'resident_landlord' || residentRole === 'tenant') {
      return allHouses.filter(house =>
        !house.activeRoles.includes('resident_landlord' as ResidentRole) &&
        !house.activeRoles.includes('tenant' as ResidentRole)
      );
    }
    return allHouses;
  }, [allHouses, residentRole]);

  const otherResidents = residentsData?.data.filter(r => r.id !== resident?.id) ?? [];

  // Get sponsors (primary residents of selected house) for sponsor-required roles
  // Uses house-specific query instead of filtering from all residents
  const availableSponsors = React.useMemo(() => {
    if (!selectedHouseId || !residentRole || !requiresSponsor(residentRole as ResidentRole)) {
      return [];
    }
    if (!houseResidents) {
      return [];
    }
    // Filter to the roles that may sponsor this role (a co-resident: Owner-Occupier or Renter only)
    const sponsorRoles = sponsorRolesFor(residentRole as ResidentRole);
    return houseResidents.filter(r =>
      r.id !== resident?.id &&
      sponsorRoles.includes(r.resident_role)
    );
  }, [selectedHouseId, residentRole, houseResidents, resident?.id]);

  // A co-resident defaults to the house's resident as sponsor (#1067); a house has at most one
  React.useEffect(() => {
    if (residentRole === 'co_resident' && availableSponsors.length === 1 && form.getValues('sponsor_resident_id') !== availableSponsors[0].id) {
      form.setValue('sponsor_resident_id', availableSponsors[0].id);
    }
  }, [residentRole, availableSponsors, form]);

  // Clear house selection when role changes and house has conflicts
  React.useEffect(() => {
    const currentHouseId = form.getValues('house_id');
    if (currentHouseId && (residentRole === 'resident_landlord' || residentRole === 'tenant')) {
      const selectedHouse = allHouses.find(h => h.id === currentHouseId);
      if (selectedHouse?.activeRoles.includes('resident_landlord' as ResidentRole) ||
          selectedHouse?.activeRoles.includes('tenant' as ResidentRole)) {
        form.setValue('house_id', undefined);
      }
    }
    // Clear sponsor when role changes to non-sponsor-required
    if (residentRole && !requiresSponsor(residentRole as ResidentRole)) {
      form.setValue('sponsor_resident_id', undefined);
    }
  }, [residentRole, allHouses, form]);

  // Determine if sponsor selection should be shown
  const showSponsorField = residentRole && requiresSponsor(residentRole as ResidentRole);

  // Validate the fields of the current step, then advance; errors stay on the step.
  async function goNext() {
    if (await form.trigger(currentStep.fields)) setStepIndex(stepIndex + 1);
  }

  // A submit-time error on a field of an earlier step sends the user back to that step.
  function onInvalid(errors: Record<string, unknown>) {
    const first = steps.findIndex((st) => st.fields.some((f) => f in errors));
    if (first >= 0) setStepIndex(first);
  }

  const submitNow = form.handleSubmit(onSubmit, onInvalid);

  // Enter advances the wizard; only the last step (or the Create button) submits.
  function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isWizard && !isLastStep) {
      void goNext();
      return;
    }
    void submitNow(e);
  }

  return (
    <Form {...form}>
      <DuplicateResidentDialog
        matches={duplicatePrompt?.matches ?? null}
        canLink={!!duplicatePrompt?.createData.house_id && !!duplicatePrompt?.createData.resident_role}
        isPending={createMutation.isPending}
        onLink={(residentId) => duplicatePrompt && runCreate(duplicatePrompt.createData, { linkToResidentId: residentId })}
        onCreateAnyway={() => duplicatePrompt && runCreate(duplicatePrompt.createData, { createAnyway: true })}
        onCancel={() => setDuplicatePrompt(null)}
      />
      <form onSubmit={handleFormSubmit} className="space-y-6 max-w-3xl">
        {isWizard && (
          <nav aria-label="Progress" className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {steps.map((st, index) => (
              <div
                key={st.id}
                aria-current={index === stepIndex ? 'step' : undefined}
                className={cn('flex items-center gap-2 text-sm', index === stepIndex ? 'font-medium' : 'text-muted-foreground')}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full border text-xs',
                    index < stepIndex && 'border-primary bg-primary text-primary-foreground',
                    index === stepIndex && 'border-primary'
                  )}
                >
                  {index < stepIndex ? <Check className="h-3 w-3" /> : index + 1}
                </span>
                {st.title}
                {st.optional && <span className="text-xs text-muted-foreground">(optional)</span>}
              </div>
            ))}
          </nav>
        )}

        {/* Personal Information */}
        {showStep('details') && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Personal Information</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="first_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="John" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="last_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="john@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone_primary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Primary Phone *</FormLabel>
                  <FormControl>
                    <Input placeholder="08012345678" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone_secondary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Secondary Phone</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="resident_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Resident Type *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} disabled={onlySecondaryAllowed}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="primary" disabled={onlySecondaryAllowed}>
                        {RESIDENT_TYPE_LABELS.primary}
                        {onlySecondaryAllowed && ' (Not available - house has primary resident)'}
                      </SelectItem>
                      <SelectItem value="secondary" disabled={entityType === 'corporate'}>
                        {RESIDENT_TYPE_LABELS.secondary}
                        {entityType === 'corporate' && ' (Not available for Corporate)'}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {onlySecondaryAllowed && (
                    <FormDescription>
                      This house already has a primary resident. Only secondary residents can be added.
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        )}

        {/* Entity Type */}
        {showStep('entity') && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Entity Type</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="entity_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Entity Type *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select entity type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(Object.entries(ENTITY_TYPE_LABELS) as [EntityType, string][]).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Individual for persons, Corporate for companies
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Corporate-specific fields */}
            {entityType === 'corporate' && (
              <>
                <FormField
                  control={form.control}
                  name="company_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="ABC Corporation Ltd" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="rc_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>RC Number</FormLabel>
                      <FormControl>
                        <Input placeholder="RC123456" {...field} />
                      </FormControl>
                      <FormDescription>Company registration number</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="liaison_contact_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Liaison Contact Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Contact person name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="liaison_contact_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Liaison Contact Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="08012345678" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
          </div>
        </div>

        )}

        {/* House Assignment (only for new residents) */}
        {!isEditing && showStep('house') && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">House Assignment</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="resident_role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableRoles.map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {residentType === 'secondary'
                        ? 'Secondary residents include occupants, family members, and staff'
                        : entityType === 'corporate'
                          ? 'Corporate entities can be Property Owners, Corporate Renters, or Developers'
                          : 'Primary residents are owners (occupier or non-resident), renters, or developers'}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="house_id"
                render={({ field }) => {
                  // When house is locked, find the preselected house for display
                  const preselectedHouse = isHouseLocked
                    ? allHouses.find(h => h.id === preselectedHouseId)
                    : null;

                  return (
                    <FormItem>
                      <FormLabel>House</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={housesLoading || isHouseLocked}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a house">
                              {isHouseLocked && preselectedHouse
                                ? `${preselectedHouse.house_number} ${preselectedHouse.street?.name}`
                                : undefined
                              }
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableHouses.map((house) => {
                            const hasResidentLandlord = house.activeRoles.includes('resident_landlord' as ResidentRole);
                            const hasTenant = house.activeRoles.includes('tenant' as ResidentRole);
                            const hasNonResidentLandlord = house.activeRoles.includes('non_resident_landlord' as ResidentRole);
                            const hasDeveloper = house.activeRoles.includes('developer' as ResidentRole);
                            let status = '';
                            if (hasResidentLandlord) status = ' (Owner-Occupied)';
                            else if (hasNonResidentLandlord && hasTenant) status = ' (Tenanted)';
                            else if (hasNonResidentLandlord) status = ' (Vacant - Landlord assigned)';
                            else if (hasDeveloper) status = ' (Developer Inventory)';
                            else if (house.is_occupied) status = ' (Occupied)';

                            return (
                              <SelectItem key={house.id} value={house.id}>
                                {house.house_number} {house.street?.name}
                                {status}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {isHouseLocked
                          ? 'House is pre-selected from the house detail page'
                          : 'Optional - can be assigned later'
                        }
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              {/* Move-in date only shown for primary residents */}
              {residentType === 'primary' && (
                <FormField
                  control={form.control}
                  name="move_in_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Move-in Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Sponsor selection for sponsor-required roles */}
              {showSponsorField && (
                <FormField
                  control={form.control}
                  name="sponsor_resident_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sponsor *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || ''}
                        disabled={!selectedHouseId || availableSponsors.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={
                              !selectedHouseId
                                ? "Select a house first"
                                : availableSponsors.length === 0
                                  ? "No sponsors available"
                                  : "Select a sponsor"
                            } />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableSponsors.map((sponsor) => (
                            <SelectItem key={sponsor.id} value={sponsor.id}>
                              {sponsor.first_name} {sponsor.last_name} ({sponsor.resident_code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {RESIDENT_ROLE_LABELS[residentRole as ResidentRole]} must be sponsored by the {describeSponsorRoles(residentRole as ResidentRole)} of the same house
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </div>
        )}

        {/* Emergency Contact */}
        {showStep('emergency') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Emergency Contact</h3>
            <Tabs value={contactMode} onValueChange={(v) => setContactMode(v as 'manual' | 'linked')}>
              <TabsList>
                <TabsTrigger value="manual">Manual Entry</TabsTrigger>
                <TabsTrigger value="linked">Link Resident</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {contactMode === 'manual' ? (
            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="emergency_contact_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Contact name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="emergency_contact_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="Contact phone" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="emergency_contact_relationship"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Relationship</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Spouse, Parent" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="emergency_contact_resident_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select Resident</FormLabel>
                    <SearchableSelect
                      options={otherResidents.map((r) => ({
                        value: r.id,
                        label: `${r.first_name} ${r.last_name} (${r.resident_code})`,
                      }))}
                      value={field.value || undefined}
                      onValueChange={field.onChange}
                      placeholder={residentsLoading ? 'Loading...' : 'Search a resident...'}
                      searchPlaceholder="Search by name or code..."
                      disabled={residentsLoading}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="emergency_contact_relationship"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Relationship</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Spouse" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
        </div>

        )}

        {/* Communications override (#716): settings.manage_general only */}
        {canManageOverride && showStep('comms') && (
          <FormField
            control={form.control}
            name="use_override_comms"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Communications override</FormLabel>
                <Select
                  onValueChange={(value) => field.onChange(selectValueToFlag(value))}
                  value={displayedFlag(storedOverrideFlag, field.value)}
                >
                  <FormControl>
                    <SelectTrigger data-testid="use-override-comms">
                      <SelectValue placeholder="Follow environment default" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="default">{FLAG_OPTION_LABELS.default}</SelectItem>
                    <SelectItem value="override">{FLAG_OPTION_LABELS.override}</SelectItem>
                    <SelectItem value="real">{FLAG_OPTION_LABELS.real}</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  {describeEnvironmentDefault(getCommsEnvironment().isProduction)} {REAL_RECIPIENT_WARNING}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Notes */}
        {showStep('notes') && (
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Any additional notes about this resident..."
                  className="min-h-[100px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        )}

        <div className="flex flex-wrap gap-4">
          {isWizard && stepIndex > 0 && (
            <Button type="button" variant="outline" onClick={() => setStepIndex(stepIndex - 1)}>
              Back
            </Button>
          )}
          {isWizard && !isLastStep && (
            <Button type="button" onClick={goNext}>
              {currentStep.optional ? 'Next (or skip)' : 'Next'}
            </Button>
          )}
          {(!isWizard || stepIndex > 0 || isLastStep) && (
            <Button
              type={isWizard && !isLastStep ? 'button' : 'submit'}
              variant={isWizard && !isLastStep ? 'secondary' : 'default'}
              disabled={isLoading}
              onClick={isWizard && !isLastStep ? submitNow : undefined}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? 'Saving...' : isEditing ? 'Update Resident' : 'Create Resident'}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
