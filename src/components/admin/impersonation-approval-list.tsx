'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  Eye,
  Check,
  X,
  Loader2,
  User,
  Home,
  Clock,
  MessageSquare,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getPendingImpersonationApprovals,
  approveImpersonationRequest,
  denyImpersonationRequest,
} from '@/actions/impersonation/approval';
import type { ImpersonationApprovalData } from '@/types/database';

const IMPERSONATION_APPROVALS_KEY = ['impersonation-approvals'];

/**
 * Impersonation Approval List
 *
 * Displays pending impersonation requests for approvers.
 * Allows approving or denying requests with optional notes.
 */
export function ImpersonationApprovalList() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: IMPERSONATION_APPROVALS_KEY,
    queryFn: async () => {
      const result = await getPendingImpersonationApprovals();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data || [];
    },
  });

  const [selectedRequest, setSelectedRequest] = useState<{
    id: string;
    action: 'approve' | 'deny';
    requesterName: string;
    residentName: string;
  } | null>(null);
  const [actionNote, setActionNote] = useState('');

  const approveMutation = useMutation({
    mutationFn: async ({ requestId, note }: { requestId: string; note?: string }) => {
      const result = await approveImpersonationRequest(requestId, note);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: IMPERSONATION_APPROVALS_KEY });
      toast.success('Request approved');
      setSelectedRequest(null);
      setActionNote('');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to approve request');
    },
  });

  const denyMutation = useMutation({
    mutationFn: async ({ requestId, reason }: { requestId: string; reason: string }) => {
      const result = await denyImpersonationRequest(requestId, reason);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: IMPERSONATION_APPROVALS_KEY });
      toast.success('Request denied');
      setSelectedRequest(null);
      setActionNote('');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to deny request');
    },
  });

  const handleAction = () => {
    if (!selectedRequest) return;

    if (selectedRequest.action === 'approve') {
      approveMutation.mutate({
        requestId: selectedRequest.id,
        note: actionNote || undefined,
      });
    } else {
      if (!actionNote.trim()) {
        toast.error('Please provide a reason for denying the request');
        return;
      }
      denyMutation.mutate({
        requestId: selectedRequest.id,
        reason: actionNote,
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-destructive">
          <AlertCircle className="h-5 w-5 mr-2" />
          <span>Failed to load approval requests</span>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-amber-500" />
            Impersonation Requests
          </CardTitle>
          <CardDescription>
            Review and approve requests from admins to view resident portals
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No pending impersonation requests</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-amber-500" />
            Impersonation Requests
            <Badge variant="secondary" className="ml-2">
              {data.length} pending
            </Badge>
          </CardTitle>
          <CardDescription>
            Review and approve requests from admins to view resident portals
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.map((request) => {
            const requestData = request.requested_changes as ImpersonationApprovalData;
            const requester = request.requester;

            return (
              <div
                key={request.id}
                className="flex items-start gap-4 p-4 rounded-lg border bg-card"
              >
                {/* Requester Avatar */}
                <Avatar className="h-10 w-10 flex-shrink-0">
                  <AvatarFallback>
                    {requester?.full_name?.charAt(0) || 'A'}
                  </AvatarFallback>
                </Avatar>

                {/* Request Details */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">
                      {requester?.full_name || 'Unknown Admin'}
                    </span>
                    <span className="text-muted-foreground">wants to view as</span>
                    <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/20">
                      {requestData.resident_name}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5" />
                      {requestData.resident_code}
                    </span>
                    {requestData.house_address && (
                      <span className="flex items-center gap-1">
                        <Home className="h-3.5 w-3.5" />
                        {requestData.house_address}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                    </span>
                  </div>

                  {requestData.reason && (
                    <div className="flex items-start gap-1.5 text-sm bg-muted/50 rounded p-2">
                      <MessageSquare className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">{requestData.reason}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() =>
                      setSelectedRequest({
                        id: request.id,
                        action: 'deny',
                        requesterName: requester?.full_name || 'Admin',
                        residentName: requestData.resident_name,
                      })
                    }
                  >
                    <X className="h-4 w-4 mr-1" />
                    Deny
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() =>
                      setSelectedRequest({
                        id: request.id,
                        action: 'approve',
                        requesterName: requester?.full_name || 'Admin',
                        residentName: requestData.resident_name,
                      })
                    }
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Action Dialog */}
      <Dialog
        open={selectedRequest !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRequest(null);
            setActionNote('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedRequest?.action === 'approve' ? 'Approve' : 'Deny'} Request
            </DialogTitle>
            <DialogDescription>
              {selectedRequest?.action === 'approve' ? (
                <>
                  You are approving <strong>{selectedRequest.requesterName}</strong>&apos;s
                  request to view the portal as{' '}
                  <strong>{selectedRequest.residentName}</strong>.
                </>
              ) : (
                <>
                  You are denying <strong>{selectedRequest?.requesterName}</strong>&apos;s
                  request to view the portal as{' '}
                  <strong>{selectedRequest?.residentName}</strong>.
                  <span className="text-destructive block mt-1">
                    A reason is required.
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {selectedRequest?.action === 'approve' ? 'Note (optional)' : 'Reason (required)'}
            </label>
            <Textarea
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
              placeholder={
                selectedRequest?.action === 'approve'
                  ? 'Add an optional note...'
                  : 'Explain why this request is being denied...'
              }
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedRequest(null);
                setActionNote('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAction}
              disabled={approveMutation.isPending || denyMutation.isPending}
              className={
                selectedRequest?.action === 'approve'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-destructive hover:bg-destructive/90'
              }
            >
              {approveMutation.isPending || denyMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : selectedRequest?.action === 'approve' ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Approve
                </>
              ) : (
                <>
                  <X className="h-4 w-4 mr-2" />
                  Deny
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
