'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
} from '@/components/ui/form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  SecurityContactStatusBadge,
  CategoryBadge,
  ValidityBadge,
} from './security-badges';
import { useVerifyAccessCode, useRecordCheckIn } from '@/hooks/use-security';
import { verifyAccessCodeSchema, checkInSchema, type VerifyAccessCodeData, type CheckInData } from '@/lib/validators/security-contact';
import { toast } from 'sonner';
import type { AccessCodeWithContact } from '@/types/database';
import {
  Search,
  CheckCircle,
  XCircle,
  AlertTriangle,
  User,
  Phone,
  Home,
  Loader2,
  LogIn,
} from 'lucide-react';

export function CodeVerification() {
  const [verificationResult, setVerificationResult] = useState<{
    data: AccessCodeWithContact | null;
    valid: boolean;
    reason?: string;
  } | null>(null);
  const [showCheckInDialog, setShowCheckInDialog] = useState(false);
  const [gateLocation, setGateLocation] = useState('');
  const [notes, setNotes] = useState('');

  const verifyMutation = useVerifyAccessCode();
  const checkInMutation = useRecordCheckIn();

  const form = useForm<VerifyAccessCodeData>({
    resolver: zodResolver(verifyAccessCodeSchema),
    defaultValues: {
      code: '',
    },
  });

  async function onSubmit(data: VerifyAccessCodeData) {
    try {
      const result = await verifyMutation.mutateAsync(data);
      setVerificationResult(result);

      if (result.valid) {
        toast.success('Access code verified successfully');
      } else {
        toast.warning(result.reason || 'Invalid access code');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Verification failed');
      setVerificationResult(null);
    }
  }

  async function handleCheckIn() {
    if (!verificationResult?.data) return;

    try {
      const checkInData: CheckInData = {
        access_code_id: verificationResult.data.id,
        contact_id: verificationResult.data.contact_id,
        gate_location: gateLocation || undefined,
        notes: notes || undefined,
      };

      await checkInMutation.mutateAsync(checkInData);
      toast.success('Check-in recorded successfully');
      setShowCheckInDialog(false);
      setVerificationResult(null);
      form.reset();
      setGateLocation('');
      setNotes('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to record check-in');
    }
  }

  const contact = verificationResult?.data?.contact;
  const resident = contact?.resident;

  return (
    <div className="space-y-6">
      {/* Verification Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Verify Access Code
          </CardTitle>
          <CardDescription>
            Enter the access code to verify authorization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex gap-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input
                        placeholder="Enter code (e.g., RES-A5K-7M3N)"
                        className="text-lg font-mono uppercase"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={verifyMutation.isPending} size="lg">
                {verifyMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Verify'
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Verification Result */}
      {verificationResult && (
        <Card
          className={
            verificationResult.valid
              ? 'border-green-500 bg-green-50 dark:bg-green-950'
              : 'border-red-500 bg-red-50 dark:bg-red-950'
          }
        >
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {verificationResult.valid ? (
                  <CheckCircle className="h-8 w-8 text-green-600" />
                ) : (
                  <XCircle className="h-8 w-8 text-red-600" />
                )}
                <div>
                  <CardTitle className={verificationResult.valid ? 'text-green-800' : 'text-red-800'}>
                    {verificationResult.valid ? 'ACCESS GRANTED' : 'ACCESS DENIED'}
                  </CardTitle>
                  {verificationResult.reason && (
                    <CardDescription className={verificationResult.valid ? 'text-green-700' : 'text-red-700'}>
                      {verificationResult.reason}
                    </CardDescription>
                  )}
                </div>
              </div>
              {verificationResult.valid && (
                <Button onClick={() => setShowCheckInDialog(true)} className="gap-2">
                  <LogIn className="h-4 w-4" />
                  Record Check-In
                </Button>
              )}
            </div>
          </CardHeader>

          {contact && (
            <CardContent className="space-y-4">
              {/* Contact Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="font-semibold flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Contact Details
                  </h4>
                  <div className="bg-white dark:bg-gray-900 p-4 rounded-lg space-y-2">
                    <p className="text-lg font-medium">{contact.full_name}</p>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{contact.phone_primary}</span>
                    </div>
                    {contact.category && (
                      <CategoryBadge name={contact.category.name} />
                    )}
                    <SecurityContactStatusBadge status={contact.status} />
                  </div>
                </div>

                {resident && (
                  <div className="space-y-2">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Home className="h-4 w-4" />
                      Resident Details
                    </h4>
                    <div className="bg-white dark:bg-gray-900 p-4 rounded-lg space-y-2">
                      <p className="text-lg font-medium">
                        {resident.first_name} {resident.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Code: {resident.resident_code}
                      </p>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{resident.phone_primary}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Access Code Info */}
              {verificationResult.data && (
                <div className="space-y-2">
                  <h4 className="font-semibold">Code Details</h4>
                  <div className="bg-white dark:bg-gray-900 p-4 rounded-lg">
                    <div className="flex items-center justify-between">
                      <code className="font-mono text-lg">{verificationResult.data.code}</code>
                      <ValidityBadge
                        validUntil={verificationResult.data.valid_until}
                        isActive={verificationResult.data.is_active}
                      />
                    </div>
                    {verificationResult.data.max_uses !== null && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Uses: {verificationResult.data.current_uses} / {verificationResult.data.max_uses}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Check-In Dialog */}
      <Dialog open={showCheckInDialog} onOpenChange={setShowCheckInDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Check-In</DialogTitle>
            <DialogDescription>
              Confirm and record the check-in for {contact?.full_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Gate Location (Optional)</label>
              <Input
                placeholder="e.g., Main Gate, Back Gate"
                value={gateLocation}
                onChange={(e) => setGateLocation(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Notes (Optional)</label>
              <Textarea
                placeholder="Any additional notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCheckInDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCheckIn} disabled={checkInMutation.isPending}>
              {checkInMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="mr-2 h-4 w-4" />
              )}
              Confirm Check-In
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
