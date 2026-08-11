import { createAdminClient } from '@/lib/supabase/server';

export async function storeReportPdf(
  reportType: string,
  buffer: Buffer,
  userId: string
): Promise<string> {
  const supabase = createAdminClient();
  const fileName = `${reportType}-${Date.now()}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from('report-pdfs')
    .upload(fileName, buffer, { contentType: 'application/pdf' });

  if (uploadError) throw new Error(`Failed to store PDF: ${uploadError.message}`);

  const { data: archiveRow, error: insertError } = await supabase
    .from('report_archive')
    .insert({
      report_type: reportType,
      generated_by: userId,
      generated_at: new Date().toISOString(),
      file_path: fileName,
      file_size_bytes: buffer.length,
      format: 'pdf',
      recipients: [],
      schedule_id: null,
    })
    .select('id')
    .single();

  if (insertError || !archiveRow) throw new Error(`Failed to create archive record: ${insertError?.message}`);

  return archiveRow.id;
}
