'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Home,
  MapPin,
  DoorOpen,
  FileCheck,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  checkRenterClearance,
  getAvailableHousesForMoveIn,
  initiateRenterMoveOut,
  type MoveOutDestination,
  type RenterClearanceCheck,
  type ClearanceCertificate,
} from '@/actions/residents/move-out-renter';
import type { ResidentRole } from '@/types/database';
import { pdf } from '@react-pdf/renderer';
import { ClearanceCertificatePDF } from '@/lib/pdf/clearance-certificate';

interface MoveOutWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  residentId: string;
  residentName: string;
  houseId: string;
  houseAddress: string;
  isSelfService?: boolean; // True when initiated from resident portal
}

type WizardStep = 'destination' | 'clearance' | 'details' | 'certificate';

const STEPS: { id: WizardStep; title: string; icon: React.ReactNode }[] = [
  { id: 'destination', title: 'Destination', icon: <MapPin className="h-4 w-4" /> },
  { id: 'clearance', title: 'Clearance', icon: <FileCheck className="h-4 w-4" /> },
  { id: 'details', title: 'Details', icon: <DoorOpen className="h-4 w-4" /> },
  { id: 'certificate', title: 'Certificate', icon: <CheckCircle className="h-4 w-4" /> },
];

const DESTINATION_ROLES: { value: ResidentRole; label: string }[] = [
  { value: 'tenant', label: 'Renter / Tenant' },
  { value: 'co_resident', label: 'Co-Resident / Occupant' },
  { value: 'household_member', label: 'Household Member / Family' },
];

export function MoveOutWizard({
  open,
  onOpenChange,
  residentId,
  residentName,
  houseId,
  houseAddress,
  isSelfService = false,
}: MoveOutWizardProps) {
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState<WizardStep>('destination');
  const [destination, setDestination] = useState<MoveOutDestination>('leaving_estate');
  const [destinationHouseId, setDestinationHouseId] = useState<string>('');
  const [destinationRole, setDestinationRole] = useState<ResidentRole>('tenant');
  const [validityDays, setValidityDays] = useState<number>(7);
  const [notes, setNotes] = useState<string>('');
  const [clearanceData, setClearanceData] = useState<RenterClearanceCheck | null>(null);
  const [certificate, setCertificate] = useState<ClearanceCertificate | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setCurrentStep('destination');
      setDestination('leaving_estate');
      setDestinationHouseId('');
      setDestinationRole('tenant');
      setValidityDays(7);
      setNotes('');
      setClearanceData(null);
      setCertificate(null);
    }
  }, [open]);

  // Fetch available houses for move-in
  const { data: availableHouses, isLoading: loadingHouses } = useQuery({
    queryKey: ['available-houses-for-movein', houseId],
    queryFn: async () => {
      const result = await getAvailableHousesForMoveIn(houseId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: open && destination === 'moving_within_estate',
  });

  // Check clearance mutation
  const clearanceMutation = useMutation({
    mutationFn: async () => {
      const result = await checkRenterClearance(residentId);
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
      const result = await initiateRenterMoveOut({
        residentId,
        houseId,
        destination,
        destinationHouseId: destination === 'moving_within_estate' ? destinationHouseId : null,
        destinationRole: destination === 'moving_within_estate' ? destinationRole : null,
        validityDays: isSelfService ? undefined : validityDays, // Self-service uses default
        notes: notes || undefined,
      });
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (result) => {
      if (result.certificate) {
        setCertificate(result.certificate);
        setCurrentStep('certificate');
        toast.success('Clearance certificate generated');
        queryClient.invalidateQueries({ queryKey: ['houses'] });
        queryClient.invalidateQueries({ queryKey: ['residents'] });
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to initiate move-out');
    },
  });

  // Handle PDF download
  const handleDownloadCertificate = async () => {
    if (!certificate) return;

    setIsDownloading(true);
    try {
      const doc = <ClearanceCertificatePDF certificate={certificate} />;
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

  // Navigation
  const handleNext = () => {
    if (currentStep === 'destination') {
      if (destination === 'moving_within_estate' && !destinationHouseId) {
        toast.error('Please select a destination property');
        return;
      }
      clearanceMutation.mutate();
    } else if (currentStep === 'clearance') {
      if (clearanceData?.canProceed) {
        setCurrentStep('details');
      }
    } else if (currentStep === 'details') {
      moveOutMutation.mutate();
    }
  };

  const handleBack = () => {
    if (currentStep === 'clearance') {
      setCurrentStep('destination');
    } else if (currentStep === 'details') {
      setCurrentStep('clearance');
    }
  };

  const handleClose = () => {
    if (currentStep === 'certificate') {
      onOpenChange(false);
    } else if (moveOutMutation.isPending || clearanceMutation.isPending) {
      return; // Don't close during operations
    } else {
      onOpenChange(false);
    }
  };

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);
  const isLoading = clearanceMutation.isPending || moveOutMutation.isPending || loadingHouses;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DoorOpen className="h-5 w-5 text-primary" />
            Renter Move-Out
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
        <div className="min-h-[300px]">
          {/* Step 1: Destination */}
          {currentStep === 'destination' && (
            <div className="space-y-4">
              <h3 className="font-medium">Where is {residentName.split(' ')[0]} moving to?</h3>

              <RadioGroup
                value={destination}
                onValueChange={(v) => setDestination(v as MoveOutDestination)}
                className="space-y-3"
              >
                <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="leaving_estate" id="leaving" className="mt-1" />
                  <Label htmlFor="leaving" className="cursor-pointer flex-1">
                    <div className="font-medium">Leaving the Estate</div>
                    <p className="text-sm text-muted-foreground">
                      The renter is moving out of the estate completely
                    </p>
                  </Label>
                </div>

                <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="moving_within_estate" id="within" className="mt-1" />
                  <Label htmlFor="within" className="cursor-pointer flex-1">
                    <div className="font-medium">Moving Within Estate</div>
                    <p className="text-sm text-muted-foreground">
                      The renter is relocating to another property in the estate
                    </p>
                  </Label>
                </div>
              </RadioGroup>

              {destination === 'moving_within_estate' && (
                <div className="space-y-4 pt-4 pl-6 border-l-2 border-primary/20">
                  <div className="space-y-2">
                    <Label>Destination Property</Label>
                    <Select
                      value={destinationHouseId}
                      onValueChange={setDestinationHouseId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select destination property" />
                      </SelectTrigger>
                      <SelectContent>
                        {loadingHouses ? (
                          <div className="p-2 text-center text-muted-foreground">
                            Loading...
                          </div>
                        ) : availableHouses?.length === 0 ? (
                          <div className="p-2 text-center text-muted-foreground">
                            No available properties
                          </div>
                        ) : (
                          availableHouses?.map((house) => (
                            <SelectItem key={house.id} value={house.id}>
                              <div className="flex items-center gap-2">
                                <Home className="h-4 w-4 text-muted-foreground" />
                                <span>
                                  {house.short_name || house.house_number}
                                  {house.street_name && `, ${house.street_name}`}
                                </span>
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Role at New Property</Label>
                    <Select
                      value={destinationRole}
                      onValueChange={(v) => setDestinationRole(v as ResidentRole)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DESTINATION_ROLES.map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Clearance Check */}
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
                  {/* Summary */}
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
                      {clearanceData.unpaidInvoiceCount > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {clearanceData.unpaidInvoiceCount} invoice(s)
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Net balance */}
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
                          {clearanceData.netBalance > 0 && ' (Credit)'}
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
                        The renter must clear their outstanding balance before the
                        move-out process can continue.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* Step 3: Details */}
          {currentStep === 'details' && (
            <div className="space-y-4">
              <h3 className="font-medium">Move-Out Details</h3>

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
                  <p className="text-xs text-muted-foreground">
                    The renter has this many days to physically vacate. Default is 7 days.
                  </p>
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

              {/* Summary */}
              <div className="mt-4 p-4 rounded-lg bg-muted space-y-2">
                <h4 className="font-medium">Summary</h4>
                <div className="text-sm space-y-1">
                  <p>
                    <span className="text-muted-foreground">Renter:</span>{' '}
                    {residentName}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Current Property:</span>{' '}
                    {houseAddress}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Destination:</span>{' '}
                    {destination === 'leaving_estate'
                      ? 'Leaving the estate'
                      : `Moving to another property`}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Validity:</span>{' '}
                    {isSelfService ? '7 days (default)' : `${validityDays} days`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Certificate */}
          {currentStep === 'certificate' && certificate && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold">Clearance Certificate Generated</h3>
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
                  <span className="text-muted-foreground">Valid Until:</span>
                  <span className="font-medium">
                    {new Date(certificate.validUntil).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
                    Pending CSO Confirmation
                  </Badge>
                </div>
              </div>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  The renter remains assigned to the property until CSO confirms the
                  physical move-out. Notifications have been sent to CSO and Finance.
                </AlertDescription>
              </Alert>

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
                onClick={currentStep === 'destination' ? handleClose : handleBack}
                disabled={isLoading}
              >
                {currentStep === 'destination' ? 'Cancel' : 'Back'}
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
                  {currentStep === 'details' ? 'Generate Certificate' : 'Next'}
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
