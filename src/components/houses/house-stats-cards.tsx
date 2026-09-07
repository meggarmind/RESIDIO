'use client';

import { Users, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface HouseStatsProps {
    occupancyStatus: 'occupied' | 'vacant' | 'maintenance';
    totalResidents: number;
    /** Total outstanding dues for the house. `null`/`undefined` means "unknown" and must
     *  NOT be rendered as "Clear" -- use `isLoading`/`isError` to convey why. */
    pendingDues?: number | null;
    isLoading?: boolean;
    isError?: boolean;
    className?: string;
}

export function HouseStatsCards({
    occupancyStatus,
    totalResidents,
    pendingDues,
    isLoading = false,
    isError = false,
    className,
}: HouseStatsProps) {

    const statusColor = {
        occupied: 'text-green-600 bg-green-100 dark:bg-green-900/20 dark:text-green-400',
        vacant: 'text-amber-600 bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400',
        maintenance: 'text-red-600 bg-red-100 dark:bg-red-900/20 dark:text-red-400',
    }[occupancyStatus];

    const hasPendingDues = typeof pendingDues === 'number';

    return (
        <div className={cn("grid gap-4 md:grid-cols-2", className)}>
            {/* Occupancy Card */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Occupancy</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-2">
                        <div className={cn("px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize", statusColor)}>
                            {occupancyStatus}
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        {totalResidents} active residents
                    </p>
                </CardContent>
            </Card>

            {/* Financial Status Card */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Financial Status</CardTitle>
                    <AlertCircle
                        className={cn(
                            "h-4 w-4",
                            isLoading || isError
                                ? "text-muted-foreground"
                                : hasPendingDues && pendingDues! > 0
                                    ? "text-red-500"
                                    : "text-green-500"
                        )}
                    />
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <>
                            <Skeleton className="h-8 w-24" />
                            <Skeleton className="h-3 w-32 mt-2" />
                        </>
                    ) : isError || !hasPendingDues ? (
                        <>
                            <div className="text-2xl font-bold text-muted-foreground">--</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Payment status unavailable
                            </p>
                        </>
                    ) : (
                        <>
                            <div className="text-2xl font-bold">
                                {pendingDues! > 0 ? `₦${pendingDues!.toLocaleString()}` : "Clear"}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                {pendingDues! > 0 ? "Outstanding dues" : "No pending payments"}
                            </p>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
