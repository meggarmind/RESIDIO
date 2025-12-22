'use client';

/**
 * Notification Templates Management Page
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
import { ArrowLeft, Plus } from 'lucide-react';
import { TemplateList } from '@/components/notifications/template-list';
import { TemplateForm } from '@/components/notifications/template-form';
import { previewTemplate } from '@/lib/notifications/templates';
import type { NotificationTemplate } from '@/lib/notifications/types';

export default function NotificationTemplatesPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<NotificationTemplate | null>(null);
  const [previewTemplateData, setPreviewTemplateData] = useState<NotificationTemplate | null>(null);

  const handleCreateSuccess = () => {
    setIsCreateOpen(false);
  };

  const handleEditSuccess = () => {
    setEditTemplate(null);
  };

  const preview = previewTemplateData ? previewTemplate(previewTemplateData) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/settings/notifications">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h3 className="text-lg font-medium">Notification Templates</h3>
            <p className="text-sm text-muted-foreground">
              Create and manage notification message templates
            </p>
          </div>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </div>
      <Separator />

      <TemplateList
        onEdit={setEditTemplate}
        onPreview={setPreviewTemplateData}
      />

      {/* Create Template Dialog */}
      <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Create Template</SheetTitle>
            <SheetDescription>
              Create a new notification template with variable placeholders
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <TemplateForm
              onSuccess={handleCreateSuccess}
              onCancel={() => setIsCreateOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit Template Dialog */}
      <Sheet open={!!editTemplate} onOpenChange={() => setEditTemplate(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Template</SheetTitle>
            <SheetDescription>
              Update the template content and settings
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            {editTemplate && (
              <TemplateForm
                template={editTemplate}
                onSuccess={handleEditSuccess}
                onCancel={() => setEditTemplate(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Preview Dialog */}
      <Dialog open={!!previewTemplateData} onOpenChange={() => setPreviewTemplateData(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
            <DialogDescription>
              Preview with sample data - {previewTemplateData?.display_name}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-4">
              {preview.subject && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Subject</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="font-medium">{preview.subject}</p>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Body</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-lg">
                    {preview.body}
                  </pre>
                </CardContent>
              </Card>
              {preview.html && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">HTML Template (Raw)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-lg overflow-x-auto">
                      {preview.html}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
