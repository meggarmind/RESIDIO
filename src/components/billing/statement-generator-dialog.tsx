'use client';

import { useState } from 'react';
import { format, subMonths, startOfMonth, endOfMonth, subYears, startOfYear, endOfYear } from 'date-fns';
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileText, Download, Loader2, Calendar, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVisualTheme } from '@/contexts/visual-theme-context';
import { toast } from 'sonner';

// ============================================================
// Types
// ============================================================

interface House {
    id: string;
    house_number: string;
    short_name?: string | null;
    street?: { name: string } | null;
}

interface StatementGeneratorDialogProps {
    residentId: string;
    residentName?: string;
    houses?: House[];
    trigger?: React.ReactNode;
    defaultHouseId?: string;
}

// Preset date ranges
type DatePreset = 'last_month' | 'last_3_months' | 'last_6_months' | 'last_year' | 'ytd' | 'custom';

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
    { value: 'last_month', label: 'Last Month' },
    { value: 'last_3_months', label: 'Last 3 Months' },
    { value: 'last_6_months', label: 'Last 6 Months' },
    { value: 'last_year', label: 'Last 12 Months' },
    { value: 'ytd', label: 'Year to Date' },
    { value: 'custom', label: 'Custom Range' },
];

// ============================================================
// Component
// ============================================================

export function StatementGeneratorDialog({
    residentId,
    residentName,
    houses = [],
    trigger,
    defaultHouseId,
}: StatementGeneratorDialogProps) {
    const { themeId } = useVisualTheme();
    const isModern = themeId === 'modern';

    const [open, setOpen] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [preset, setPreset] = useState<DatePreset>('last_3_months');
    const [houseId, setHouseId] = useState<string>(defaultHouseId || 'all');
    const [customFromDate, setCustomFromDate] = useState('');
    const [customToDate, setCustomToDate] = useState('');

    // Calculate dates based on preset
    const getDateRange = (): { from: string; to: string } => {
        const today = new Date();
        const endDate = endOfMonth(subMonths(today, 1)); // End of last month

        switch (preset) {
            case 'last_month': {
                const lastMonth = subMonths(today, 1);
                return {
                    from: format(startOfMonth(lastMonth), 'yyyy-MM-dd'),
                    to: format(endOfMonth(lastMonth), 'yyyy-MM-dd'),
                };
            }
            case 'last_3_months': {
                return {
                    from: format(startOfMonth(subMonths(today, 3)), 'yyyy-MM-dd'),
                    to: format(endDate, 'yyyy-MM-dd'),
                };
            }
            case 'last_6_months': {
                return {
                    from: format(startOfMonth(subMonths(today, 6)), 'yyyy-MM-dd'),
                    to: format(endDate, 'yyyy-MM-dd'),
                };
            }
            case 'last_year': {
                return {
                    from: format(startOfMonth(subMonths(today, 12)), 'yyyy-MM-dd'),
                    to: format(endDate, 'yyyy-MM-dd'),
                };
            }
            case 'ytd': {
                return {
                    from: format(startOfYear(today), 'yyyy-MM-dd'),
                    to: format(today, 'yyyy-MM-dd'),
                };
            }
            case 'custom': {
                return {
                    from: customFromDate,
                    to: customToDate,
                };
            }
            default:
                return {
                    from: format(startOfMonth(subMonths(today, 3)), 'yyyy-MM-dd'),
                    to: format(endDate, 'yyyy-MM-dd'),
                };
        }
    };

    const handleGenerate = async () => {
        const { from, to } = getDateRange();

        // Validate custom dates
        if (preset === 'custom') {
            if (!customFromDate || !customToDate) {
                toast.error('Please select both start and end dates');
                return;
            }
            if (new Date(customFromDate) > new Date(customToDate)) {
                toast.error('Start date must be before end date');
                return;
            }
        }

        setIsGenerating(true);

        try {
            // Build URL with query parameters
            const params = new URLSearchParams({
                residentId,
                fromDate: from,
                toDate: to,
            });

            if (houseId && houseId !== 'all') {
                params.append('houseId', houseId);
            }

            const url = `/api/statements?${params.toString()}`;

            // Fetch the PDF
            const response = await fetch(url);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to generate statement');
            }

            // Get the blob and create download
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);

            // Extract filename from Content-Disposition header or create one
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'statement.pdf';
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="?([^"]+)"?/);
                if (match) {
                    filename = match[1];
                }
            }

            // Create temporary link and trigger download
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Clean up the blob URL
            window.URL.revokeObjectURL(downloadUrl);

            toast.success('Statement downloaded successfully');
            setOpen(false);
        } catch (error) {
            console.error('Statement generation error:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to generate statement');
        } finally {
            setIsGenerating(false);
        }
    };

    const dateRange = getDateRange();

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button
                        variant="outline"
                        size="sm"
                        className={cn(isModern && 'rounded-xl')}
                    >
                        <FileText className="mr-2 h-4 w-4" />
                        Generate Statement
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className={cn(
                'sm:max-w-[425px]',
                isModern && 'rounded-2xl'
            )}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Generate Account Statement
                    </DialogTitle>
                    <DialogDescription>
                        {residentName
                            ? `Generate a PDF statement for ${residentName} showing all invoices, payments, and balance history.`
                            : 'Generate a PDF statement showing all invoices, payments, and balance history for the selected period.'
                        }
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    {/* Property Selection (if multiple houses) */}
                    {houses.length > 1 && (
                        <div className="grid gap-2">
                            <Label htmlFor="house" className="flex items-center gap-2">
                                <Building2 className="h-4 w-4" />
                                Property
                            </Label>
                            <Select value={houseId} onValueChange={setHouseId}>
                                <SelectTrigger
                                    id="house"
                                    className={cn(isModern && 'rounded-xl')}
                                >
                                    <SelectValue placeholder="All properties" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Properties</SelectItem>
                                    {houses.map((house) => (
                                        <SelectItem key={house.id} value={house.id}>
                                            {house.short_name || house.house_number}
                                            {house.street?.name && `, ${house.street.name}`}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Date Range Selection */}
                    <div className="grid gap-2">
                        <Label htmlFor="period" className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            Statement Period
                        </Label>
                        <Select
                            value={preset}
                            onValueChange={(value) => setPreset(value as DatePreset)}
                        >
                            <SelectTrigger
                                id="period"
                                className={cn(isModern && 'rounded-xl')}
                            >
                                <SelectValue placeholder="Select period" />
                            </SelectTrigger>
                            <SelectContent>
                                {DATE_PRESETS.map((p) => (
                                    <SelectItem key={p.value} value={p.value}>
                                        {p.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Custom Date Inputs */}
                    {preset === 'custom' && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="fromDate">From</Label>
                                <Input
                                    id="fromDate"
                                    type="date"
                                    value={customFromDate}
                                    onChange={(e) => setCustomFromDate(e.target.value)}
                                    className={cn(isModern && 'rounded-xl')}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="toDate">To</Label>
                                <Input
                                    id="toDate"
                                    type="date"
                                    value={customToDate}
                                    onChange={(e) => setCustomToDate(e.target.value)}
                                    className={cn(isModern && 'rounded-xl')}
                                />
                            </div>
                        </div>
                    )}

                    {/* Preview of Selected Period */}
                    {preset !== 'custom' && (
                        <div className={cn(
                            'rounded-lg border p-3 bg-muted/50',
                            isModern && 'rounded-xl'
                        )}>
                            <p className="text-sm text-muted-foreground">
                                Statement will cover:
                            </p>
                            <p className="text-sm font-medium mt-1">
                                {format(new Date(dateRange.from), 'MMM d, yyyy')} to{' '}
                                {format(new Date(dateRange.to), 'MMM d, yyyy')}
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => setOpen(false)}
                        disabled={isGenerating}
                        className={cn(isModern && 'rounded-xl')}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className={cn(
                            isModern && 'rounded-xl bg-[#0EA5E9] hover:bg-[#0284C7] text-white'
                        )}
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Generating...
                            </>
                        ) : (
                            <>
                                <Download className="mr-2 h-4 w-4" />
                                Download PDF
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
