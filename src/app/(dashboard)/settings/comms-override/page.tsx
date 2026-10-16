'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertCircle, Loader2, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getCommsOverrideState,
  updateCommsOverrideSettings,
  type CommsOverrideState,
} from '@/actions/settings/comms-override';
import { isValidOverrideEmail, isValidOverridePhone } from '@/lib/comms-override/resolver';

const QUERY_KEY = ['comms-override-state'];

function PageHeader() {
  return (
    <div>
      <h3 className="text-lg font-medium flex items-center gap-2">
        <ShieldAlert className="h-5 w-5" /> Communications override
      </h3>
      <p className="text-sm text-muted-foreground">
        Redirects outbound email, SMS and WhatsApp to the contacts below, so UAT data never messages real people.
      </p>
    </div>
  );
}

export default function CommsOverridePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const result = await getCommsOverrideState();
      if (result.error || !result.data) throw new Error(result.error || 'Failed to load');
      return result.data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <Separator />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error instanceof Error ? error.message : 'Failed to load the communications override.'}</AlertDescription>
      </Alert>
    );
  }

  // Keyed on the stored values so fresh server data re-initialises the form.
  return (
    <OverrideForm
      key={`${data.storedEnabled}|${data.email}|${data.phone}|${data.whatsappPhone}`}
      data={data}
    />
  );
}

function OverrideForm({ data }: { data: CommsOverrideState }) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(data.storedEnabled);
  const [email, setEmail] = useState(data.email);
  const [phone, setPhone] = useState(data.phone);
  const [whatsappPhone, setWhatsappPhone] = useState(data.whatsappPhone);

  const save = useMutation({
    mutationFn: async () => {
      const result = await updateCommsOverrideSettings({ enabled, email, phone, whatsappPhone });
      if (!result.success) throw new Error(result.error || 'Failed to save');
    },
    onSuccess: () => {
      toast.success('Communications override saved');
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const emailError = email.trim() !== '' && !isValidOverrideEmail(email.trim()) ? 'Enter a valid email address.' : null;
  const phoneError = phone.trim() !== '' && !isValidOverridePhone(phone.trim()) ? 'Use international format, e.g. +2348012345678.' : null;
  const whatsappError = whatsappPhone.trim() !== '' && !isValidOverridePhone(whatsappPhone.trim()) ? 'Use international format, e.g. +2348012345678.' : null;
  const hasErrors = Boolean(emailError || phoneError || whatsappError);
  const blankWhileActive = data.effectiveEnabled && (email.trim() === '' || phone.trim() === '');

  return (
    <div className="space-y-6">
      <PageHeader />
      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Effective state</CardTitle>
          <CardDescription>What the system is doing right now.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>Environment: <strong>{data.environment}</strong></p>
          <p>
            Redirect: <strong>{data.effectiveEnabled ? 'on' : 'off'}</strong>
            {!data.isProduction && ' (forced on: non-production)'}
          </p>
        </CardContent>
      </Card>

      {blankWhileActive && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            The redirect is active but an override email or phone is blank. Messages that need a blank value are blocked, not sent.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Global switch</CardTitle>
          <CardDescription>
            {data.isProduction
              ? 'When on, every message that follows the global rule is redirected.'
              : 'Outside production the redirect is always on and cannot be turned off here.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label htmlFor="comms-override-enabled">Redirect outbound communications</Label>
            <Switch
              id="comms-override-enabled"
              checked={data.isProduction ? enabled : true}
              onCheckedChange={setEnabled}
              disabled={!data.isProduction || save.isPending}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Override contacts</CardTitle>
          <CardDescription>Redirected messages are delivered here. Leave blank only if you want those messages blocked.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="comms-override-email">Override email</Label>
            <Input id="comms-override-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            {emailError && <p className="text-xs text-destructive">{emailError}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="comms-override-phone">Override phone (SMS and WhatsApp)</Label>
            <Input id="comms-override-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2348012345678" />
            {phoneError && <p className="text-xs text-destructive">{phoneError}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="comms-override-whatsapp">WhatsApp number (optional)</Label>
            <Input id="comms-override-whatsapp" value={whatsappPhone} onChange={(e) => setWhatsappPhone(e.target.value)} placeholder="Falls back to the override phone" />
            {whatsappError && <p className="text-xs text-destructive">{whatsappError}</p>}
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending || hasErrors}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
