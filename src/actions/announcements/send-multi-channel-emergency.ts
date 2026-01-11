'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { createNotificationsForAllResidents } from '@/actions/in-app-notifications/create-notification';
import { sendEmail, getEstateEmailSettings } from '@/lib/email/send-email';
import { sendSms } from '@/lib/sms/send-sms';
import { EmergencyBroadcastEmail } from '@/emails/emergency-broadcast';
import type { Announcement } from '@/types/database';

export interface MultiChannelEmergencyInput {
  title: string;
  content: string;
  summary?: string;
  channels: {
    inApp: boolean;
    email: boolean;
    sms: boolean;
    whatsapp: boolean; // Future: not implemented yet
  };
}

export interface ChannelResult {
  channel: string;
  success: boolean;
  count: number;
  error?: string;
}

export interface MultiChannelEmergencyResponse {
  data: {
    announcement: Announcement;
    results: ChannelResult[];
    totalRecipients: number;
  } | null;
  error: string | null;
}

/**
 * Get all active residents with their contact information
 */
async function getActiveResidentsWithContacts() {
  const supabase = createAdminClient();

  const { data: residents, error } = await supabase
    .from('residents')
    .select('id, first_name, last_name, email, phone_primary')
    .eq('account_status', 'active');

  if (error) {
    console.error('Error fetching residents:', error);
    return { residents: [], error: error.message };
  }

  return { residents: residents || [], error: null };
}

/**
 * Send emergency broadcast via email to all residents
 */
async function sendEmailBroadcast(
  residents: Array<{ id: string; first_name: string; last_name: string; email: string | null }>,
  title: string,
  content: string,
  summary: string | undefined,
  broadcastTime: string,
  announcementId: string
): Promise<ChannelResult> {
  const estateSettings = await getEstateEmailSettings();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://residio.app';
  const viewUrl = `${baseUrl}/announcements/${announcementId}`;

  // Filter residents with valid emails
  const recipientsWithEmail = residents.filter(
    (r) => r.email && r.email.includes('@')
  );

  if (recipientsWithEmail.length === 0) {
    return {
      channel: 'email',
      success: true,
      count: 0,
      error: 'No residents with valid email addresses',
    };
  }

  let successCount = 0;
  let errorCount = 0;

  // Send emails in batches to avoid rate limits
  const batchSize = 50;
  for (let i = 0; i < recipientsWithEmail.length; i += batchSize) {
    const batch = recipientsWithEmail.slice(i, i + batchSize);

    // Send to each recipient individually (Resend prefers individual sends for tracking)
    const promises = batch.map(async (resident) => {
      try {
        const result = await sendEmail({
          to: {
            email: resident.email!,
            name: `${resident.first_name} ${resident.last_name}`,
            residentId: resident.id,
          },
          subject: `EMERGENCY: ${title}`,
          react: EmergencyBroadcastEmail({
            estateName: estateSettings.estateName,
            estateEmail: estateSettings.estateEmail,
            estatePhone: estateSettings.estatePhone,
            estateAddress: estateSettings.estateAddress,
            estateWebsite: estateSettings.estateWebsite,
            title,
            content,
            summary,
            broadcastTime,
            viewUrl,
          }),
          emailType: 'emergency_broadcast',
          metadata: {
            announcement_id: announcementId,
            is_emergency: true,
          },
        });

        return result.success;
      } catch (err) {
        console.error(`Failed to send email to ${resident.email}:`, err);
        return false;
      }
    });

    const results = await Promise.all(promises);
    successCount += results.filter(Boolean).length;
    errorCount += results.filter((r) => !r).length;
  }

  return {
    channel: 'email',
    success: errorCount === 0,
    count: successCount,
    error: errorCount > 0 ? `Failed to send ${errorCount} emails` : undefined,
  };
}

/**
 * Send emergency broadcast via SMS to all residents
 */
async function sendSmsBroadcast(
  residents: Array<{ id: string; first_name: string; last_name: string; phone_primary: string }>,
  title: string,
  content: string,
  summary: string | undefined
): Promise<ChannelResult> {
  // Filter residents with valid phone numbers
  const recipientsWithPhone = residents.filter(
    (r) => r.phone_primary && r.phone_primary.length >= 10
  );

  if (recipientsWithPhone.length === 0) {
    return {
      channel: 'sms',
      success: true,
      count: 0,
      error: 'No residents with valid phone numbers',
    };
  }

  // Compose SMS message (limited to 160 chars for single SMS)
  const smsMessage = summary
    ? `EMERGENCY: ${title}\n\n${summary}\n\nCheck Residio app for full details.`
    : `EMERGENCY: ${title}\n\n${content.substring(0, 100)}${content.length > 100 ? '...' : ''}\n\nCheck Residio app for details.`;

  let successCount = 0;
  let errorCount = 0;

  // Send SMS in batches
  const batchSize = 20;
  for (let i = 0; i < recipientsWithPhone.length; i += batchSize) {
    const batch = recipientsWithPhone.slice(i, i + batchSize);

    const promises = batch.map(async (resident) => {
      try {
        const result = await sendSms({
          to: {
            phone: resident.phone_primary,
            name: `${resident.first_name} ${resident.last_name}`,
            residentId: resident.id,
          },
          message: smsMessage,
          smsType: 'emergency',
          metadata: {
            is_emergency: true,
            title,
          },
        });

        return result.success;
      } catch (err) {
        console.error(`Failed to send SMS to ${resident.phone_primary}:`, err);
        return false;
      }
    });

    const results = await Promise.all(promises);
    successCount += results.filter(Boolean).length;
    errorCount += results.filter((r) => !r).length;
  }

  return {
    channel: 'sms',
    success: errorCount === 0,
    count: successCount,
    error: errorCount > 0 ? `Failed to send ${errorCount} SMS messages` : undefined,
  };
}

/**
 * Send a multi-channel emergency broadcast to all residents
 * - Creates an announcement with emergency priority, published immediately
 * - Sends notifications via selected channels (in-app, email, SMS, WhatsApp)
 * Requires announcements.emergency_broadcast permission
 */
export async function sendMultiChannelEmergencyBroadcast(
  input: MultiChannelEmergencyInput
): Promise<MultiChannelEmergencyResponse> {
  // Authorization check - requires emergency broadcast permission
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_EMERGENCY_BROADCAST);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();
  const now = new Date().toISOString();

  // Create the emergency announcement first
  const insertData = {
    title: input.title,
    content: input.content,
    summary: input.summary || null,
    category_id: null, // Emergency broadcasts don't need a category
    status: 'published' as const,
    priority: 'emergency' as const,
    target_audience: 'all' as const,
    target_houses: null,
    is_pinned: true, // Emergency broadcasts are always pinned
    published_at: now,
    scheduled_for: null,
    expires_at: null,
    attachment_urls: null,
    created_by: auth.userId,
    updated_by: auth.userId,
  };

  const { data: announcement, error: announcementError } = await supabase
    .from('announcements')
    .insert(insertData)
    .select()
    .single();

  if (announcementError) {
    console.error('Error creating emergency broadcast:', announcementError);
    return { data: null, error: announcementError.message };
  }

  // Fetch all active residents
  const { residents, error: residentsError } = await getActiveResidentsWithContacts();
  if (residentsError) {
    console.error('Error fetching residents:', residentsError);
    // Continue with announcement created, but note the error
  }

  const channelResults: ChannelResult[] = [];
  let totalRecipients = 0;

  // Send via in-app notifications
  if (input.channels.inApp) {
    const { count: notificationCount, error: notificationError } =
      await createNotificationsForAllResidents({
        title: `EMERGENCY: ${input.title}`,
        body:
          input.summary ||
          input.content.substring(0, 200) + (input.content.length > 200 ? '...' : ''),
        icon: 'alert-triangle',
        category: 'emergency',
        entity_type: 'announcement',
        entity_id: announcement.id,
        action_url: `/announcements/${announcement.id}`,
        priority: 'urgent',
        metadata: {
          is_emergency: true,
          broadcast_at: now,
        },
      });

    channelResults.push({
      channel: 'in_app',
      success: !notificationError,
      count: notificationCount,
      error: notificationError || undefined,
    });

    if (notificationCount > totalRecipients) {
      totalRecipients = notificationCount;
    }
  }

  // Send via email
  if (input.channels.email && residents.length > 0) {
    const emailResult = await sendEmailBroadcast(
      residents,
      input.title,
      input.content,
      input.summary,
      now,
      announcement.id
    );
    channelResults.push(emailResult);

    if (emailResult.count > totalRecipients) {
      totalRecipients = emailResult.count;
    }
  }

  // Send via SMS
  if (input.channels.sms && residents.length > 0) {
    const smsResult = await sendSmsBroadcast(
      residents,
      input.title,
      input.content,
      input.summary
    );
    channelResults.push(smsResult);

    if (smsResult.count > totalRecipients) {
      totalRecipients = smsResult.count;
    }
  }

  // WhatsApp - placeholder for future implementation
  if (input.channels.whatsapp) {
    channelResults.push({
      channel: 'whatsapp',
      success: false,
      count: 0,
      error: 'WhatsApp notifications not yet implemented',
    });
  }

  // Log audit event with channel details
  await logAudit({
    action: 'CREATE',
    entityType: 'announcements',
    entityId: announcement.id,
    entityDisplay: announcement.title,
    newValues: {
      ...insertData,
      channels_used: input.channels,
      channel_results: channelResults,
      total_recipients: totalRecipients,
    },
    description: `Emergency broadcast sent: "${announcement.title}" via ${channelResults
      .filter((r) => r.success)
      .map((r) => r.channel)
      .join(', ')} to ${totalRecipients} residents`,
  });

  return {
    data: {
      announcement: announcement as Announcement,
      results: channelResults,
      totalRecipients,
    },
    error: null,
  };
}

/**
 * Get emergency contact directory for the estate
 * Returns commonly needed emergency contacts
 */
export async function getEmergencyContactDirectory() {
  const supabase = await createServerSupabaseClient();

  // Get estate settings for estate-specific contacts
  const { data: settings } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', [
      'estate_name',
      'estate_phone',
      'estate_email',
      'estate_address',
      'security_gate_phone',
      'estate_manager_phone',
      'estate_manager_name',
    ]);

  const settingsMap = settings?.reduce(
    (acc, s) => {
      acc[s.key] = s.value;
      return acc;
    },
    {} as Record<string, unknown>
  ) || {};

  // Build emergency contacts list
  const emergencyContacts = [
    // Estate-specific contacts
    {
      name: (settingsMap.estate_name as string) || 'Estate Office',
      phone: settingsMap.estate_phone as string | undefined,
      email: settingsMap.estate_email as string | undefined,
      category: 'estate',
      priority: 1,
    },
    {
      name: 'Security Gate',
      phone: settingsMap.security_gate_phone as string | undefined,
      category: 'security',
      priority: 2,
    },
    {
      name: (settingsMap.estate_manager_name as string) || 'Estate Manager',
      phone: settingsMap.estate_manager_phone as string | undefined,
      category: 'management',
      priority: 3,
    },
    // National emergency contacts (Nigeria)
    {
      name: 'National Emergency Number',
      phone: '112',
      category: 'emergency',
      priority: 10,
      description: 'Police, Fire, Ambulance',
    },
    {
      name: 'Police Emergency',
      phone: '199',
      category: 'police',
      priority: 11,
    },
    {
      name: 'Fire Service',
      phone: '01-7944929',
      category: 'fire',
      priority: 12,
    },
    {
      name: 'Federal Road Safety Corps (FRSC)',
      phone: '122',
      category: 'road_safety',
      priority: 13,
    },
    {
      name: 'NSCDC (Civil Defence)',
      phone: '0800-222-555',
      category: 'security',
      priority: 14,
    },
    {
      name: 'Lagos State Emergency (LASEMA)',
      phone: '112 / 767',
      category: 'emergency',
      priority: 15,
      description: 'Lagos State only',
    },
  ].filter((contact) => contact.phone); // Only include contacts with phone numbers

  return {
    data: emergencyContacts,
    error: null,
  };
}
