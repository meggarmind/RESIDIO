'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Clock, FileBarChart, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GenerateInvoicesDialog } from '@/components/billing/generate-invoices-dialog';
import { GenerationHistoryPanel } from '@/components/billing/generation-history-panel';
import { useLatestGenerationLog } from '@/hooks/use-billing';
import { EnhancedAlertBanner, EnhancedPageHeader } from '@/components/dashboard/enhanced-stat-card';

export default function BillingGeneratePage() {
    const [showGenerateDialog, setShowGenerateDialog] = useState(false);
    const { data: lastGeneration } = useLatestGenerationLog();

    return (
        <div className="space-y-6">
            <EnhancedPageHeader
                title="Generate Invoices"
                description="Prepare reviewable invoice runs and track generation history"
                icon={FileBarChart}
                actions={
                    <div className="flex gap-2">
                        <Button variant="outline" asChild>
                            <Link href="/billing">
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Back to Billing
                            </Link>
                        </Button>
                        <Button onClick={() => setShowGenerateDialog(true)}>
                            <FileText className="mr-2 h-4 w-4" />
                            Generate Invoices
                        </Button>
                    </div>
                }
            />

            {lastGeneration && (
                <EnhancedAlertBanner
                    type="success"
                    icon={CheckCircle2}
                    title={`Last generated: ${new Date(lastGeneration.generated_at).toLocaleDateString('en-NG', {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                    })}`}
                    description={`${lastGeneration.generated_count} generated, ${lastGeneration.skipped_count} skipped${lastGeneration.error_count > 0 ? `, ${lastGeneration.error_count} errors` : ''} • ${lastGeneration.trigger_type}${lastGeneration.actor?.full_name ? ` by ${lastGeneration.actor.full_name}` : ''}${lastGeneration.duration_ms ? ` • ${(lastGeneration.duration_ms / 1000).toFixed(1)}s` : ''}`}
                    action={
                        lastGeneration.target_period && (
                            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                                <Clock className="h-4 w-4" />
                                {new Date(lastGeneration.target_period).toLocaleDateString('en-NG', {
                                    month: 'short',
                                    year: 'numeric',
                                })}
                            </div>
                        )
                    }
                />
            )}

            <GenerationHistoryPanel onRetry={() => setShowGenerateDialog(true)} />

            <GenerateInvoicesDialog open={showGenerateDialog} onClose={() => setShowGenerateDialog(false)} />
        </div>
    );
}
