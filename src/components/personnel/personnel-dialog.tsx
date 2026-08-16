'use client';

import { useState, useEffect } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { createPersonnel, updatePersonnel } from '@/actions/personnel/actions';
import { createEstateEngagement, createPersonnelWithEstateEngagement, createResidentHouseEngagement, endPersonnelEngagement, getActiveResidentHouses, updateEstateEngagement, updateResidentHouseEngagement, type ActiveResidentHouseOption } from '@/actions/personnel/engagements';
import type { PersonnelInsert } from '@/types/database';
import { Personnel, PersonnelWithEngagements } from '@/types/database';

const personnelSchema = z.object({
    name: z.string().min(2, 'Name is required'),
    type: z.enum(['staff', 'vendor', 'contractor', 'supplier'] as const),
    status: z.enum(['active', 'inactive', 'terminated'] as const).default('active'),
    contact_person: z.string().optional(),
    email: z.string().email('Invalid email').optional().or(z.literal('')),
    phone: z.string().optional(),
    job_title: z.string().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    notes: z.string().optional(),
    accountability_scope: z.enum(['unassigned', 'estate', 'resident_house']).default('unassigned'),
    engagement_responsibility: z.string().optional(),
    engagement_start_date: z.string().optional(),
    engagement_end_date: z.string().optional(),
    resident_house_id: z.string().optional(),
});

type PersonnelFormValues = z.infer<typeof personnelSchema>;

interface PersonnelDialogProps {
    personnel?: PersonnelWithEngagements; // If provided, edit mode
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    trigger?: React.ReactNode;
    onSuccess?: () => void;
}

export function PersonnelDialog({
    personnel,
    open: controlledOpen,
    onOpenChange: setControlledOpen,
    trigger,
    onSuccess,
}: PersonnelDialogProps) {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const open = controlledOpen ?? uncontrolledOpen;
    const setOpen = setControlledOpen ?? setUncontrolledOpen;
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activeResidentHouses, setActiveResidentHouses] = useState<ActiveResidentHouseOption[]>([]);
    const [endingEngagementId, setEndingEngagementId] = useState<string | null>(null);

    const isEditing = !!personnel;
    const estateEngagement = personnel?.active_engagements.find(
        (engagement) => engagement.accountability_scope === 'estate'
    );
    const residentHouseEngagement = personnel?.active_engagements.find(
        (engagement) => engagement.accountability_scope === 'resident_house'
    );

    const form = useForm<PersonnelFormValues>({
        resolver: zodResolver(personnelSchema) as Resolver<PersonnelFormValues>,
        defaultValues: {
            name: personnel?.name || '',
            type: personnel?.type || 'vendor',
            status: personnel?.status || 'active',
            contact_person: personnel?.contact_person || '',
            email: personnel?.email || '',
            phone: personnel?.phone || '',
            job_title: personnel?.job_title || '',
            start_date: personnel?.start_date || '',
            end_date: personnel?.end_date || '',
            notes: personnel?.notes || '',
            accountability_scope: estateEngagement ? 'estate' : residentHouseEngagement ? 'resident_house' : 'unassigned',
            engagement_responsibility: estateEngagement?.responsibility || residentHouseEngagement?.responsibility || '',
            engagement_start_date: estateEngagement?.start_date || residentHouseEngagement?.start_date || new Date().toISOString().split('T')[0],
            engagement_end_date: estateEngagement?.end_date || residentHouseEngagement?.end_date || '',
            resident_house_id: residentHouseEngagement?.resident_house_id || '',
        },
    });
    const accountabilityScope = form.watch('accountability_scope');
    useEffect(() => {
        if (!open) return;
        void getActiveResidentHouses().then((result) => {
            if (result.data) setActiveResidentHouses(result.data);
        });
    }, [open]);
    // Reset form when personnel changes
    useEffect(() => {
        form.reset({
            name: personnel?.name || '',
            type: personnel?.type || 'vendor',
            status: personnel?.status || 'active',
            contact_person: personnel?.contact_person || '',
            email: personnel?.email || '',
            phone: personnel?.phone || '',
            job_title: personnel?.job_title || '',
            start_date: personnel?.start_date || '',
            end_date: personnel?.end_date || '',
            notes: personnel?.notes || '',
            accountability_scope: estateEngagement ? 'estate' : 'unassigned',
            engagement_responsibility: estateEngagement?.responsibility || '',
            engagement_start_date: estateEngagement?.start_date || new Date().toISOString().split('T')[0],
            engagement_end_date: estateEngagement?.end_date || '',
            resident_house_id: '',
        });
    }, [personnel, estateEngagement, residentHouseEngagement, form]);

    async function onSubmit(formData: PersonnelFormValues) {
        setIsSubmitting(true);
        try {
            const sanitize = (val?: string) => (!val || val.trim() === '') ? null : val;
            const {
                accountability_scope,
                engagement_responsibility,
                engagement_start_date,
                engagement_end_date,
                resident_house_id,
                ...personnelFormData
            } = formData;
            if (accountability_scope !== 'unassigned' && !engagement_start_date) {
                throw new Error('An engagement start date is required');
            }
            if (engagement_end_date && engagement_start_date && engagement_end_date < engagement_start_date) {
                throw new Error('An engagement end date cannot be before its start date');
            }
            const values = {
                ...personnelFormData,
                contact_person: sanitize(formData.contact_person),
                email: sanitize(formData.email),
                phone: sanitize(formData.phone),
                job_title: sanitize(formData.job_title),
                start_date: sanitize(formData.start_date),
                end_date: sanitize(formData.end_date),
                notes: sanitize(formData.notes),
            } as Partial<Personnel>;

            const estateInput = {
                responsibility: sanitize(engagement_responsibility),
                startDate: engagement_start_date || '',
                endDate: sanitize(engagement_end_date),
            };
            const savedPersonnel = personnel
                ? await updatePersonnel(personnel.id, values)
                : accountability_scope === 'estate'
                    ? await createPersonnelWithEstateEngagement(values as PersonnelInsert, estateInput)
                    : await createPersonnel(values as PersonnelInsert);

            if (savedPersonnel.error || !savedPersonnel.data) {
                throw new Error(savedPersonnel.error || 'Failed to save personnel');
            }

            const activeEngagements = personnel?.active_engagements ?? [];
            const retainedEngagementId = accountability_scope === 'estate'
                ? estateEngagement?.id
                : accountability_scope === 'resident_house' && residentHouseEngagement?.resident_house_id === resident_house_id
                    ? residentHouseEngagement?.id
                    : undefined;
            for (const engagement of activeEngagements) {
                if (engagement.id !== retainedEngagementId) {
                    const endResult = await endPersonnelEngagement(engagement.id);
                    if (endResult.error) throw new Error(endResult.error);
                }
            }

            if (accountability_scope === 'estate') {
                const engagementInput = estateInput;

                const engagementResult = personnel && (estateEngagement
                    ? await updateEstateEngagement(estateEngagement.id, engagementInput)
                    : await createEstateEngagement({
                        personnelId: savedPersonnel.data.id,
                        ...engagementInput,
                    }));

                if (engagementResult?.error) throw new Error(engagementResult.error);
            }

            if (accountability_scope === 'resident_house') {
                if (!resident_house_id) throw new Error('Select an active Resident House');
                const engagementResult = residentHouseEngagement && residentHouseEngagement.resident_house_id === resident_house_id
                    ? await updateResidentHouseEngagement(residentHouseEngagement.id, estateInput)
                    : await createResidentHouseEngagement({
                        personnelId: savedPersonnel.data.id,
                        residentHouseId: resident_house_id,
                        ...estateInput,
                    });
                if (engagementResult.error) throw new Error(engagementResult.error);
            }

            if (personnel) {
                toast.success(`${values.name} updated successfully`);
            } else {
                toast.success(`${values.name} created successfully`);
            }
            setOpen(false);
            form.reset();
            onSuccess?.();
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : 'Something went wrong');
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleEndEngagement(id: string) {
        setEndingEngagementId(id);
        try {
            const result = await endPersonnelEngagement(id);
            if (result.error) throw new Error(result.error);
            toast.success('Engagement ended');
            onSuccess?.();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to end engagement');
        } finally {
            setEndingEngagementId(null);
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {trigger ? (
                <DialogTrigger asChild>{trigger}</DialogTrigger>
            ) : (
                !controlledOpen && <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Add Personnel</Button></DialogTrigger>
            )}
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{isEditing ? 'Edit Personnel' : 'Add New Personnel'}</DialogTitle>
                    <DialogDescription>
                        {isEditing
                            ? 'Update the details of this personnel record.'
                            : 'Add a new staff member, contractor, vendor, or supplier.'}
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <div className="grid gap-4 md:grid-cols-2">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Name / Company Name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="e.g. John Doe or ABC Corrections" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="type"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Type</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select type" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="staff">Estate Staff</SelectItem>
                                                <SelectItem value="contractor">Contractor</SelectItem>
                                                <SelectItem value="vendor">Vendor</SelectItem>
                                                <SelectItem value="supplier">Supplier</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="contact_person"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Contact Person (Optional)</FormLabel>
                                        <FormControl>
                                            <Input placeholder="e.g. Jane Smith" {...field} />
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
                                        <FormLabel>Email (Optional)</FormLabel>
                                        <FormControl>
                                            <Input placeholder="email@example.com" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="phone"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Phone (Optional)</FormLabel>
                                        <FormControl>
                                            <Input placeholder="080..." {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="job_title"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Job Title / Role (Optional)</FormLabel>
                                        <FormControl>
                                            <Input placeholder="e.g. Security Guard" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="status"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Status</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select status" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="active">Active</SelectItem>
                                                <SelectItem value="inactive">Inactive</SelectItem>
                                                <SelectItem value="terminated">Terminated</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <FormField
                                control={form.control}
                                name="start_date"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Start Date (Optional)</FormLabel>
                                        <FormControl>
                                            <Input type="date" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="end_date"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>End Date (Optional)</FormLabel>
                                        <FormControl>
                                            <Input type="date" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="space-y-4 rounded-lg border p-4">
                            <div>
                                <h3 className="font-medium">Accountability</h3>
                                <p className="text-sm text-muted-foreground">
                                    Record the accountable party for this personnel relationship.
                                </p>
                            </div>
                            <FormField
                                control={form.control}
                                name="accountability_scope"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Accountable Party</FormLabel>
                                        <Select
                                            onValueChange={field.onChange}
                                            value={field.value}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="unassigned">Unassigned</SelectItem>
                                                <SelectItem value="estate">Estate</SelectItem>
                                                <SelectItem value="resident_house">Resident House</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {accountabilityScope !== 'unassigned' && (
                                <div className="grid gap-4 md:grid-cols-3">
                                    <FormField
                                        control={form.control}
                                        name="engagement_responsibility"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Responsibility</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="e.g. Gate supervisor" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    {accountabilityScope === 'resident_house' && (
                                        <FormField
                                            control={form.control}
                                            name="resident_house_id"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Resident House</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value || ''}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select active Resident House" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {activeResidentHouses.map((house) => (
                                                                <SelectItem key={house.id} value={house.id}>
                                                                    {house.houseNumber}{house.streetName ? `, ${house.streetName}` : ''} · {house.residentName}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                    <FormField
                                        control={form.control}
                                        name="engagement_start_date"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Engagement Start Date</FormLabel>
                                                <FormControl>
                                                    <Input type="date" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="engagement_end_date"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Engagement End Date</FormLabel>
                                                <FormControl>
                                                    <Input type="date" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            )}
                        </div>

                        {personnel && personnel.engagement_history.length > 0 && (
                            <div className="space-y-3 rounded-lg border p-4">
                                <div>
                                    <h3 className="font-medium">Engagement History</h3>
                                    <p className="text-sm text-muted-foreground">Active and ended accountability relationships.</p>
                                </div>
                                <div className="space-y-2">
                                    {personnel.engagement_history.map((engagement) => (
                                        <div key={engagement.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 p-3 text-sm">
                                            <div>
                                                <p className="font-medium">
                                                    {engagement.accountability_scope === 'estate'
                                                        ? 'Estate'
                                                        : engagement.resident_house
                                                            ? `${engagement.resident_house.house_number}${engagement.resident_house.street_name ? `, ${engagement.resident_house.street_name}` : ''} · ${engagement.resident_house.resident_name}`
                                                            : 'Resident House'}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {engagement.responsibility || 'No responsibility recorded'} · {engagement.start_date} to {engagement.end_date || 'Present'}
                                                </p>
                                            </div>
                                            {!engagement.end_date && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleEndEngagement(engagement.id)}
                                                    disabled={endingEngagementId === engagement.id}
                                                >
                                                    {endingEngagementId === engagement.id && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                                                    End
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <FormField
                            control={form.control}
                            name="notes"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Notes (Optional)</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="Additional information..." {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {isEditing ? 'Save Changes' : 'Create Personnel'}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
