'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
    Loader2,
    CheckCircle,
    XCircle,
    AlertTriangle,
    DoorOpen,
    FileCheck,
    Download,
    Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
    checkOwnerClearance,
    initiateOwnerMoveOut,
    type OwnerClearanceCheck,
    type OwnerClearanceCertificate,
} from '@/actions/residents/move-out-owner';
import { pdf } from '@react-pdf/renderer';
import { ClearanceCertificatePDF } from '@/lib/pdf/clearance-certificate';

interface OwnerMoveOutWizardProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    residentId: string;
    residentName: string;
    houseId: string;
    houseAddress: string;
    secondaryResidentCount?: number;
    isSelfService?: boolean;
}

type WizardStep = 'clearance' | 'details' | 'certificate';

const STEPS: { id: WizardStep; title: string; icon: React.ReactNode }[] = [
    { id: 'clearance', title: 'Clearance', icon: <FileCheck className="h-4 w-4" /> },
    { id: 'details', title: 'Details', icon: <DoorOpen className="h-4 w-4" /> },
    { id: 'certificate', title: 'Certificate', icon: <CheckCircle className="h-4 w-4" /> },
];

export function OwnerMoveOutWizard({
    open,
    onOpenChange,
    residentId,
    residentName,
    houseId,
    houseAddress,
    secondaryResidentCount = 0,
    isSelfService = false,
}: OwnerMoveOutWizardProps) {
    const queryClient = useQueryClient();
    const [currentStep, setCurrentStep] = useState<WizardStep>('clearance');
    const [validityDays, setValidityDays] = useState<number>(7);
    const [notes, setNotes] = useState<string>('');
    const [clearanceData, setClearanceData] = useState<OwnerClearanceCheck | null>(null);
    const [certificate, setCertificate] = useState<OwnerClearanceCertificate | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);

    // Reset state when dialog closes
    useEffect(() => {
        if (!open) {
            setCurrentStep('clearance');
            setValidityDays(7);
            setNotes('');
            setClearanceData(null);
            setCertificate(null);
        }
    }, [open]);

    // Check clearance mutation
    const clearanceMutation = useMutation({
        mutationFn: async () => {
            const result = await checkOwnerClearance(residentId);
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        onSuccess: (data) => {
            setClearanceData(data);
            if (data?.canProceed) {
                setCurrentStep('details');
            }
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to check clearance');
        },
    });

    // Initiate move-out mutation
    const moveOutMutation = useMutation({
        mutationFn: async () => {
            const result = await initiateOwnerMoveOut({
                residentId,
                houseId,
                validityDays: isSelfService ? undefined : validityDays,
                notes: notes || undefined,
            });
            if (result.error) throw new Error(result.error);
            return result;
        },
        onSuccess: (result) => {
            if (result.certificate) {
                setCertificate(result.certificate);
                setCurrentStep('certificate');
                toast.success('Move-out completed. You are now a Property Owner.');
                queryClient.invalidateQueries({ queryKey: ['houses'] });
                queryClient.invalidateQueries({ queryKey: ['residents'] });
            }
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to complete move-out');
        },
    });

    // Handle PDF download
    const handleDownloadCertificate = async () => {
        if (!certificate) return;

        setIsDownloading(true);
        try {
            // Convert to renter certificate format for PDF
            const pdfCertificate = {
                ...certificate,
                destination: 'leaving_estate' as const,
                destinationHouse: null,
            };
            const doc = <ClearanceCertificatePDF certificate={pdfCertificate} />;
            const blob = await pdf(doc).toBlob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `clearance-${certificate.certificateNumber}.pdf`;
            link.click();
            URL.revokeObjectURL(url);
            toast.success('Certificate downloaded');
        } catch (error) {
            console.error('Error generating PDF:', error);
            toast.error('Failed to generate PDF');
        } finally {
            setIsDownloading(false);
        }
    };

    // Start clearance check when dialog opens
    useEffect(() => {
        if (open && currentStep === 'clearance' && !clearanceData && !clearanceMutation.isPending) {
            clearanceMutation.mutate();
        }
    }, [open, currentStep, clearanceData, clearanceMutation.isPending]);

    // Navigation
    const handleNext = () => {
        if (currentStep === 'clearance') {
            if (clearanceData?.canProceed) {
                setCurrentStep('details');
            }
        } else if (currentStep === 'details') {
            moveOutMutation.mutate();
        }
    };

    const handleBack = () => {
        if (currentStep === 'details') {
            setCurrentStep('clearance');
        }
    };

    const handleClose = () => {
        if (currentStep === 'certificate') {
            onOpenChange(false);
        } else if (moveOutMutation.isPending || clearanceMutation.isPending) {
            return;
        } else {
            onOpenChange(false);
        }
    };

    const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);
    const isLoading = clearanceMutation.isPending || moveOutMutation.isPending;

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[550px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-primary" />
                        Owner-Occupier Move-Out
                    </DialogTitle>
                    <DialogDescription>
                        {residentName} from {houseAddress}
                    </DialogDescription>
                </DialogHeader>

                {/* Step indicators */}
                <div className="flex items-center justify-between mb-6">
                    {STEPS.map((step, index) => (
                        <div key={step.id} className="flex items-center">
                            <div
                                className={cn(
                                    'flex items-center justify-center w-8 h-8 rounded-full border-2',
                                    index < currentStepIndex
                                        ? 'bg-primary border-primary text-primary-foreground'
                                        : index === currentStepIndex
                                            ? 'border-primary text-primary'
                                            : 'border-muted text-muted-foreground'
                                )}
                            >
                                {index < currentStepIndex ? (
                                    <CheckCircle className="h-4 w-4" />
                                ) : (
                                    step.icon
                                )}
                            </div>
                            {index < STEPS.length - 1 && (
                                <div
                                    className={cn(
                                        'w-12 h-0.5 mx-1',
                                        index < currentStepIndex ? 'bg-primary' : 'bg-muted'
                                    )}
                                />
                            )}
                        </div>
                    ))}
                </div>

                <Separator className="mb-4" />

                {/* Step content */}
                <div className="min-h-[280px]">
                    {/* Step 1: Clearance Check */}
                    {currentStep === 'clearance' && (
                        <div className="space-y-4">
                            <h3 className="font-medium">Financial Clearance Check</h3>

                            {clearanceMutation.isPending ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                    <span className="ml-2">Checking financial status...</span>
                                </div>
                            ) : clearanceData ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 rounded-lg bg-muted">
                                            <p className="text-sm text-muted-foreground">Wallet Balance</p>
                                            <p className="text-lg font-semibold">
                                                ₦{clearanceData.walletBalance.toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="p-4 rounded-lg bg-muted">
                                            <p className="text-sm text-muted-foreground">Unpaid Invoices</p>
                                            <p className="text-lg font-semibold text-destructive">
                                                ₦{clearanceData.totalUnpaid.toLocaleString()}
                                            </p>
                                        </div>
                                    </div>

                                    <div
                                        className={cn(
                                            'p-4 rounded-lg border-2',
                                            clearanceData.canProceed
                                                ? 'border-green-500 bg-green-50 dark:bg-green-950'
                                                : 'border-destructive bg-destructive/10'
                                        )}
                                    >
                                        <div className="flex items-center gap-2">
                                            {clearanceData.canProceed ? (
                                                <CheckCircle className="h-5 w-5 text-green-600" />
                                            ) : (
                                                <XCircle className="h-5 w-5 text-destructive" />
                                            )}
                                            <div>
                                                <p className="font-medium">
                                                    Net Balance: ₦{Math.abs(clearanceData.netBalance).toLocaleString()}
                                                    {clearanceData.netBalance < 0 && ' (Outstanding)'}
                                                </p>
                                                <p className="text-sm text-muted-foreground">
                                                    {clearanceData.message}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {!clearanceData.canProceed && (
                                        <Alert variant="destructive">
                                            <AlertTriangle className="h-4 w-4" />
                                            <AlertTitle>Cannot Proceed</AlertTitle>
                                            <AlertDescription>
                                                Please clear the outstanding balance before moving out.
                                            </AlertDescription>
                                        </Alert>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    )}

                    {/* Step 2: Details */}
                    {currentStep === 'details' && (
                        <div className="space-y-4">
                            <h3 className="font-medium">Move-Out Details</h3>

                            <Alert>
                                <Building2 className="h-4 w-4" />
                                <AlertDescription>
                                    After this move-out, you will be converted to a <strong>Property Owner</strong> (non-resident landlord). You will retain ownership but no longer reside at the property.
                                </AlertDescription>
                            </Alert>

                            {secondaryResidentCount > 0 && (
                                <Alert variant="warning">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertDescription>
                                        <strong>{secondaryResidentCount} secondary resident(s)</strong> will also be removed from this property.
                                    </AlertDescription>
                                </Alert>
                            )}

                            {!isSelfService && (
                                <div className="space-y-2">
                                    <Label htmlFor="validity">Validity Period (days)</Label>
                                    <Input
                                        id="validity"
                                        type="number"
                                        min={1}
                                        max={30}
                                        value={validityDays}
                                        onChange={(e) => setValidityDays(parseInt(e.target.value) || 7)}
                                    />
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="notes">Notes (optional)</Label>
                                <Textarea
                                    id="notes"
                                    placeholder="Any additional notes about this move-out..."
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    rows={3}
                                />
                            </div>
                        </div>
                    )}

                    {/* Step 3: Certificate */}
                    {currentStep === 'certificate' && certificate && (
                        <div className="space-y-4 text-center">
                            <div className="flex justify-center">
                                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                                    <CheckCircle className="h-8 w-8 text-green-600" />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-lg font-semibold">Move-Out Complete</h3>
                                <p className="text-muted-foreground">
                                    Certificate #{certificate.certificateNumber}
                                </p>
                            </div>

                            <div className="p-4 rounded-lg bg-muted text-left space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Resident:</span>
                                    <span className="font-medium">{certificate.residentName}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Property:</span>
                                    <span className="font-medium">{certificate.houseAddress}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">New Role:</span>
                                    <Badge variant="outline">Property Owner</Badge>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Secondary Removed:</span>
                                    <span className="font-medium">{certificate.secondaryResidentsRemoved}</span>
                                </div>
                            </div>

                            <Button
                                onClick={handleDownloadCertificate}
                                disabled={isDownloading}
                                className="w-full"
                            >
                                {isDownloading ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <Download className="h-4 w-4 mr-2" />
                                )}
                                Download Certificate
                            </Button>
                        </div>
                    )}
                </div>

                <DialogFooter className="mt-4">
                    {currentStep !== 'certificate' && (
                        <>
                            <Button
                                variant="outline"
                                onClick={currentStep === 'clearance' ? handleClose : handleBack}
                                disabled={isLoading}
                            >
                                {currentStep === 'clearance' ? 'Cancel' : 'Back'}
                            </Button>

                            {currentStep === 'clearance' && clearanceData && !clearanceData.canProceed ? (
                                <Button variant="outline" onClick={handleClose}>
                                    Close
                                </Button>
                            ) : (
                                <Button
                                    onClick={handleNext}
                                    disabled={
                                        isLoading ||
                                        (currentStep === 'clearance' && !clearanceData?.canProceed)
                                    }
                                >
                                    {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    {currentStep === 'details' ? 'Complete Move-Out' : 'Next'}
                                </Button>
                            )}
                        </>
                    )}

                    {currentStep === 'certificate' && (
                        <Button onClick={handleClose}>Done</Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
