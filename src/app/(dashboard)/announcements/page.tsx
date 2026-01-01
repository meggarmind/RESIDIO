'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AnnouncementsTable } from '@/components/announcements';
import { useSendEmergencyBroadcast } from '@/hooks/use-announcements';
import { useAuth } from '@/lib/auth/auth-provider';
import { Megaphone, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AnnouncementsPage() {
  const [emergencyDialogOpen, setEmergencyDialogOpen] = useState(false);
  const [emergencyTitle, setEmergencyTitle] = useState('');
  const [emergencyContent, setEmergencyContent] = useState('');
  const [confirmText, setConfirmText] = useState('');

  const { hasPermission } = useAuth();
  const sendEmergencyBroadcast = useSendEmergencyBroadcast();

  const canSendEmergency = hasPermission('announcements.emergency_broadcast');

  const handleSendEmergency = async () => {
    if (confirmText !== 'SEND') return;

    try {
      const result = await sendEmergencyBroadcast.mutateAsync({
        title: emergencyTitle,
        content: emergencyContent,
      });

      toast.success(
        `Emergency broadcast sent to ${result?.notificationCount || 0} residents`,
        { duration: 5000 }
      );

      setEmergencyDialogOpen(false);
      setEmergencyTitle('');
      setEmergencyContent('');
      setConfirmText('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send emergency broadcast');
    }
  };

  const isFormValid = emergencyTitle.trim().length >= 5 && emergencyContent.trim().length >= 10;
  const canConfirm = isFormValid && confirmText === 'SEND';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Announcements</h1>
          <p className="text-muted-foreground">
            Create and manage community announcements and communications.
          </p>
        </div>

        {canSendEmergency && (
          <Button
            variant="destructive"
            onClick={() => setEmergencyDialogOpen(true)}
            className="gap-2"
          >
            <AlertTriangle className="h-4 w-4" />
            Emergency Broadcast
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            Community Announcements
          </CardTitle>
          <CardDescription>
            View, create, and manage announcements for the community.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnnouncementsTable />
        </CardContent>
      </Card>

      {/* Emergency Broadcast Dialog */}
      <Dialog open={emergencyDialogOpen} onOpenChange={setEmergencyDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Emergency Broadcast
            </DialogTitle>
            <DialogDescription>
              This will immediately publish an emergency announcement and send urgent notifications to ALL residents.
              Use this only for critical situations.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="emergency-title">Title</Label>
              <Input
                id="emergency-title"
                placeholder="Emergency: Brief description"
                value={emergencyTitle}
                onChange={(e) => setEmergencyTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="emergency-content">Message</Label>
              <Textarea
                id="emergency-content"
                placeholder="Provide details about the emergency and any actions residents should take..."
                value={emergencyContent}
                onChange={(e) => setEmergencyContent(e.target.value)}
                rows={5}
              />
            </div>

            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-3">
              <p className="text-sm font-medium text-destructive">
                Confirm Emergency Broadcast
              </p>
              <p className="text-xs text-muted-foreground">
                Type <strong>SEND</strong> to confirm you want to send this emergency broadcast to all residents immediately.
              </p>
              <Input
                placeholder="Type SEND to confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                className="font-mono"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEmergencyDialogOpen(false)}
              disabled={sendEmergencyBroadcast.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleSendEmergency}
              disabled={!canConfirm || sendEmergencyBroadcast.isPending}
            >
              {sendEmergencyBroadcast.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Send Emergency Broadcast
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
