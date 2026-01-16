'use client';

import { Users, AlertCircle, History, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface HouseStatsProps {
    occupancyStatus: 'occupied' | 'vacant' | 'maintenance';
    totalResidents: number;
    pendingDues: number;
    lastInspectionDate?: string;
    className?: string;
}

export function HouseStatsCards({
    occupancyStatus,
    totalResidents,
    pendingDues,
    lastInspectionDate = 'N/A',
    className,
}: HouseStatsProps) {

    const statusColor = {
        occupied: 'text-green-600 bg-green-100 dark:bg-green-900/20 dark:text-green-400',
        vacant: 'text-amber-600 bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400',
        maintenance: 'text-red-600 bg-red-100 dark:bg-red-900/20 dark:text-red-400',
    }[occupancyStatus];

    return (
        <div className={cn("grid gap-4 md:grid-cols-3", className)}>
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
                    <AlertCircle className={cn("h-4 w-4", pendingDues > 0 ? "text-red-500" : "text-green-500")} />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">
                        {pendingDues > 0 ? `₦${pendingDues.toLocaleString()}` : "Clear"}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        {pendingDues > 0 ? "Outstanding dues" : "No pending payments"}
                    </p>
                </CardContent>
            </Card>

            {/* History/Inspection Card */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Last Inspection</CardTitle>
                    <History className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{lastInspectionDate}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Compliance verified
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
