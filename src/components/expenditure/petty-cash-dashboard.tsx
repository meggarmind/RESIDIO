import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Coins, Plus, Receipt, History, AlertCircle, Loader2 } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-provider';
import { PettyCashMetrics } from '@/actions/finance/petty-cash';
import { toast } from 'sonner';

interface PettyCashDashboardProps {
    data: PettyCashMetrics;
    onSnapLog?: (receiptData: any) => void;
    onTopUp?: () => void;
}

/**
 * PettyCashDashboard
 * 
 * Manages the "Digital Float" for estate operations.
 * Allows quick top-ups, expense logging, and "Snap & Log" receipt capture.
 */
export function PettyCashDashboard({ data, onSnapLog, onTopUp }: PettyCashDashboardProps) {
    const { totalBalance, metrics, recentTransactions } = data;
    const [isScanning, setIsScanning] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processReceipt(file);
    };

    const processReceipt = async (file: File) => {
        setIsScanning(true);

        // Mock OCR delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        setIsScanning(false);
        toast.success("Receipt scanned successfully!");

        if (onSnapLog) {
            onSnapLog({
                amount: '45000',
                expense_date: new Date().toISOString().split('T')[0],
                description: 'Detected: Petrol Station Receipt',
                vendor_id: '', // Would try to match vendor
                status: 'paid'
            });
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) processReceipt(file);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    return (
        <div className="space-y-6">
            {/* Header / Main Balance Card */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="col-span-2 bg-gradient-to-br from-primary/5 via-primary/10 to-transparent border-primary/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                            <span>Digital Float Balance</span>
                            <Coins className="h-4 w-4 text-primary" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-baseline justify-between">
                            <div className="text-3xl font-bold">{formatCurrency(totalBalance)}</div>
                            <Button size="sm" className="gap-2" onClick={onTopUp}>
                                <Plus className="h-4 w-4" /> Top Up
                            </Button>
                        </div>
                        <div className="mt-4 flex items-center text-xs text-muted-foreground gap-4">
                            <span className="flex items-center gap-1">
                                <ActivityIndicator status="healthy" />
                                Float Healthy (&gt; ₦50k)
                            </span>
                            <span>•</span>
                            <span>Last topped up: 3 days ago</span>
                        </div>
                    </CardContent>
                </Card>

                {/* Quick Stats */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Month-to-Date Spend</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(metrics.totalSpentThisMonth)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            +12% from last month
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Pending Receipts</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <div className="text-2xl font-bold">{metrics.pendingReconciliations}</div>
                            {metrics.pendingReconciliations > 0 && (
                                <Badge variant="outline" className="border-amber-500 text-amber-500 bg-amber-50 dark:bg-amber-900/10">
                                    Needs Review
                                </Badge>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Unreconciled expenses
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Main Action Area */}
            <div className="grid gap-6 md:grid-cols-3">
                {/* Snap & Log Section */}
                <Card
                    className={cn(
                        "md:col-span-2 border-dashed border-2 bg-muted/50 hover:bg-muted/70 transition-colors cursor-pointer group relative overflow-hidden",
                        isScanning && "pointer-events-none opacity-80"
                    )}
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                >
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*,.pdf"
                        onChange={handleFileSelect}
                    />

                    <CardContent className="flex flex-col items-center justify-center py-12 text-center h-full">
                        {isScanning ? (
                            <div className="flex flex-col items-center animate-in fade-in zoom-in">
                                <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
                                <h3 className="text-lg font-semibold">Analyzing Receipt...</h3>
                                <p className="text-sm text-muted-foreground">Extracting date, amount, and vendor</p>
                            </div>
                        ) : (
                            <>
                                <div className="h-16 w-16 rounded-full bg-background shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                    <Receipt className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                                </div>
                                <h3 className="text-lg font-semibold">Snap & Log Receipt</h3>
                                <p className="text-sm text-muted-foreground max-w-sm mt-2">
                                    Drag and drop receipt image here, or click to upload.
                                    AI will extract date and amount.
                                </p>
                                <Button variant="secondary" className="mt-6">
                                    Upload Receipt
                                </Button>
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* Recent Activity Mini-Feed */}
                <Card className="h-full flex flex-col">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <History className="h-4 w-4" />
                            Recent Activity
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1">
                        <div className="space-y-4">
                            {recentTransactions.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
                            ) : (
                                recentTransactions.map((tx) => (
                                    <div key={tx.id} className="flex items-start justify-between text-sm pb-4 border-b last:border-0 last:pb-0">
                                        <div className="grid gap-1">
                                            <p className="font-medium">{tx.description || 'Uncategorized Expense'}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {tx.vendorName || 'Unknown Vendor'} • {new Date(tx.expenseDate).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <div className="font-medium text-destructive">
                                            -{formatCurrency(tx.amount || 0)}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        <Button variant="ghost" size="sm" className="w-full mt-4 text-xs">
                            View all transactions
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function ActivityIndicator({ status }: { status: 'healthy' | 'warning' | 'critical' }) {
    return (
        <span className={cn("h-2 w-2 rounded-full", {
            "bg-emerald-500": status === 'healthy',
            "bg-amber-500": status === 'warning',
            "bg-red-500": status === 'critical',
        })} />
    );
}
