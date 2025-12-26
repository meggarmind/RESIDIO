'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    AlertTriangle,
    Calendar,
    CalendarClock,
    Clock,
    FileBarChart,
    Plus,
    Receipt,
    RefreshCw,
    ScrollText,
    Settings2,
    Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
    useReportSchedules,
    useCreateReportSchedule,
    useUpdateReportSchedule,
    useDeleteReportSchedule,
    useBankAccountsForFilter,
    type ReportSchedule,
    type CreateScheduleInput,
} from '@/hooks/use-reports';
import { format, formatDistanceToNow } from 'date-fns';

// ============================================================
// Configuration
// ============================================================

const reportTypeOptions = [
    { value: 'financial_overview', label: 'Financial Overview', icon: FileBarChart },
    { value: 'collection_report', label: 'Collection Report', icon: Receipt },
    { value: 'invoice_aging', label: 'Invoice Aging', icon: Clock },
    { value: 'transaction_log', label: 'Transaction Log', icon: ScrollText },
] as const;

const frequencyOptions = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'yearly', label: 'Yearly' },
] as const;

const periodPresetOptions = [
    { value: 'last_month', label: 'Last Month' },
    { value: 'this_month', label: 'This Month' },
    { value: 'last_quarter', label: 'Last Quarter' },
    { value: 'this_quarter', label: 'This Quarter' },
    { value: 'last_year', label: 'Last Year' },
    { value: 'this_year', label: 'This Year' },
] as const;

const dayOfWeekOptions = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' },
];

// ============================================================
// Schedule Card Component
// ============================================================

function ScheduleCard({
    schedule,
    onToggle,
    onDelete,
}: {
    schedule: ReportSchedule;
    onToggle: (id: string, isActive: boolean) => void;
    onDelete: (id: string) => void;
}) {
    const reportType = reportTypeOptions.find((r) => r.value === schedule.report_type);
    const Icon = reportType?.icon || FileBarChart;

    return (
        <Card className={cn(
            'transition-all duration-200',
            !schedule.is_active && 'opacity-60'
        )}>
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="p-2.5 rounded-lg bg-emerald-500/10 shrink-0">
                            <Icon className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div className="min-w-0">
                            <h4 className="font-medium text-sm truncate">{schedule.name}</h4>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {reportType?.label} &bull; {schedule.frequency}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                                <Badge variant="outline" className="text-[10px]">
                                    {schedule.period_preset?.replace('_', ' ') || 'Custom'}
                                </Badge>
                                {schedule.next_run_at && (
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                        <CalendarClock className="h-3 w-3" />
                                        Next: {format(new Date(schedule.next_run_at), 'MMM d, yyyy')}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Switch
                            checked={schedule.is_active}
                            onCheckedChange={(checked) => onToggle(schedule.id, checked)}
                        />
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => onDelete(schedule.id)}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// ============================================================
// Create Schedule Dialog
// ============================================================

function CreateScheduleDialog({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const createSchedule = useCreateReportSchedule();
    const { data: bankAccounts } = useBankAccountsForFilter();
    const [formData, setFormData] = useState<Partial<CreateScheduleInput>>({
        report_type: 'financial_overview',
        frequency: 'monthly',
        period_preset: 'last_month',
        day_of_month: 1,
        include_charts: true,
        include_summary: true,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.report_type || !formData.frequency || !formData.period_preset) {
            toast.error('Please fill in all required fields');
            return;
        }
        try {
            await createSchedule.mutateAsync(formData as CreateScheduleInput);
            onOpenChange(false);
            setFormData({
                report_type: 'financial_overview',
                frequency: 'monthly',
                period_preset: 'last_month',
                day_of_month: 1,
                include_charts: true,
                include_summary: true,
            });
        } catch {
            // Error handled by hook
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Create Report Schedule</DialogTitle>
                    <DialogDescription>
                        Set up automated recurring report generation
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Schedule Name *</Label>
                        <Input
                            id="name"
                            placeholder="e.g., Monthly Financial Summary"
                            value={formData.name || ''}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            placeholder="Optional description..."
                            rows={2}
                            value={formData.description || ''}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Report Type *</Label>
                            <Select
                                value={formData.report_type}
                                onValueChange={(v) => setFormData({ ...formData, report_type: v as CreateScheduleInput['report_type'] })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {reportTypeOptions.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Frequency *</Label>
                            <Select
                                value={formData.frequency}
                                onValueChange={(v) => setFormData({ ...formData, frequency: v as CreateScheduleInput['frequency'] })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {frequencyOptions.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {formData.frequency === 'weekly' && (
                        <div className="space-y-2">
                            <Label>Day of Week</Label>
                            <Select
                                value={String(formData.day_of_week ?? 1)}
                                onValueChange={(v) => setFormData({ ...formData, day_of_week: parseInt(v) })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {dayOfWeekOptions.map((opt) => (
                                        <SelectItem key={opt.value} value={String(opt.value)}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {(formData.frequency === 'monthly' || formData.frequency === 'quarterly' || formData.frequency === 'yearly') && (
                        <div className="space-y-2">
                            <Label>Day of Month (1-28)</Label>
                            <Input
                                type="number"
                                min={1}
                                max={28}
                                value={formData.day_of_month || 1}
                                onChange={(e) => setFormData({ ...formData, day_of_month: parseInt(e.target.value) || 1 })}
                            />
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>Report Period *</Label>
                        <Select
                            value={formData.period_preset}
                            onValueChange={(v) => setFormData({ ...formData, period_preset: v as CreateScheduleInput['period_preset'] })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {periodPresetOptions.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {bankAccounts && bankAccounts.length > 0 && (
                        <div className="space-y-2">
                            <Label>Filter by Bank Account (optional)</Label>
                            <Select
                                value={formData.bank_account_ids?.[0] || 'all'}
                                onValueChange={(v) => setFormData({
                                    ...formData,
                                    bank_account_ids: v === 'all' ? undefined : [v]
                                })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="All accounts" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Accounts</SelectItem>
                                    {bankAccounts.map((acc) => (
                                        <SelectItem key={acc.id} value={acc.id}>
                                            {acc.account_name} ({acc.bank_name})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={createSchedule.isPending}>
                            {createSchedule.isPending ? (
                                <>
                                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                'Create Schedule'
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ============================================================
// Main Component
// ============================================================

export function ReportSchedulesPanel() {
    const { data: schedules, isLoading } = useReportSchedules();
    const updateSchedule = useUpdateReportSchedule();
    const deleteSchedule = useDeleteReportSchedule();
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    const handleToggle = async (id: string, isActive: boolean) => {
        try {
            await updateSchedule.mutateAsync({ id, input: { is_active: isActive } });
        } catch {
            // Error handled by hook
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteSchedule.mutateAsync(id);
            setDeleteConfirmId(null);
        } catch {
            // Error handled by hook
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-semibold">Automated Schedules</h3>
                    <p className="text-sm text-muted-foreground">
                        Reports are generated automatically at 6 AM UTC
                    </p>
                </div>
                <Button onClick={() => setCreateDialogOpen(true)} size="sm">
                    <Plus className="h-4 w-4 mr-1.5" />
                    New Schedule
                </Button>
            </div>

            {schedules && schedules.length > 0 ? (
                <div className="space-y-3">
                    {schedules.map((schedule) => (
                        <ScheduleCard
                            key={schedule.id}
                            schedule={schedule}
                            onToggle={handleToggle}
                            onDelete={(id) => setDeleteConfirmId(id)}
                        />
                    ))}
                </div>
            ) : (
                <Card className="border-dashed">
                    <CardContent className="py-8 text-center">
                        <CalendarClock className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                        <p className="font-medium text-sm">No schedules configured</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Create a schedule to automate report generation
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-4"
                            onClick={() => setCreateDialogOpen(true)}
                        >
                            <Plus className="h-4 w-4 mr-1.5" />
                            Create First Schedule
                        </Button>
                    </CardContent>
                </Card>
            )}

            <CreateScheduleDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
            />

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-destructive" />
                            Delete Schedule
                        </DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete this schedule? This action cannot be undone.
                            Previously generated reports will not be affected.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
                            disabled={deleteSchedule.isPending}
                        >
                            {deleteSchedule.isPending ? 'Deleting...' : 'Delete'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
