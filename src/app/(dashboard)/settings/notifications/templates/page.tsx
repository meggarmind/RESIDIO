'use client';

/**
 * Email wording page: edit the text of the resident emails (#907).
 */

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { TemplateList } from '@/components/notifications/template-list';
import { TemplateForm } from '@/components/notifications/template-form';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  EVENT_REGISTRY,
  SAMPLE_VARIABLES,
  isEventKey,
  mergeEventContent,
  renderEventText,
} from '@/lib/notifications/event-content-registry';
import type { NotificationTemplate } from '@/lib/notifications/types';

export default function NotificationTemplatesPage() {
  const { hasPermission } = useAuth();
  // The save action checks notifications.manage; hide the control for viewers who cannot use it.
  const canManage = hasPermission('notifications.manage');
  const [editTemplate, setEditTemplate] = useState<NotificationTemplate | null>(null);
  const [previewTemplateData, setPreviewTemplateData] = useState<NotificationTemplate | null>(null);

  const previewEvent =
    previewTemplateData?.event && isEventKey(previewTemplateData.event)
      ? previewTemplateData.event
      : null;
  const previewContent = previewEvent
    ? mergeEventContent(previewEvent, previewTemplateData?.overrides)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label="Back to notification settings">
          <Link href="/settings/notifications">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h3 className="text-lg font-medium">Email Wording</h3>
          <p className="text-sm text-muted-foreground">
            Edit the wording of the emails residents receive. Anything left empty uses the built-in text.
          </p>
        </div>
      </div>
      <Separator />

      <TemplateList
        canManage={canManage}
        onEdit={setEditTemplate}
        onPreview={setPreviewTemplateData}
      />

      {/* Edit Dialog */}
      <Sheet open={!!editTemplate} onOpenChange={() => setEditTemplate(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit {editTemplate?.display_name}</SheetTitle>
            <SheetDescription>
              Change the wording. The email layout and the details it shows stay the same.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 px-4 pb-6">
            {editTemplate && canManage && (
              <TemplateForm
                key={editTemplate.id}
                template={editTemplate}
                onSuccess={() => setEditTemplate(null)}
                onCancel={() => setEditTemplate(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Preview Dialog */}
      <Dialog open={!!previewTemplateData} onOpenChange={() => setPreviewTemplateData(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
            <DialogDescription>
              Sample data, showing your saved wording - {previewTemplateData?.display_name}
            </DialogDescription>
          </DialogHeader>
          {previewEvent && previewContent && (
            <div className="space-y-4">
              {EVENT_REGISTRY[previewEvent].fields.map((field) => (
                <Card key={field.key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      {field.group ? `${field.group}: ` : ''}
                      {field.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap text-sm">
                      {renderEventText(previewContent[field.key], SAMPLE_VARIABLES)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
