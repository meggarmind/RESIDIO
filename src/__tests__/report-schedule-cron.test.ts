import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Both crons read report_schedules; only process-report-schedules emails. generate-reports
// advanced next_run_at without sending, so the 07:00 run found nothing due (#999).
describe('scheduled report cron', () => {
  const cron = (name: string) => join(process.cwd(), 'src/app/api/cron', name, 'route.ts');

  it('has no generate-reports cron that consumes schedules without emailing', () => {
    expect(existsSync(cron('generate-reports'))).toBe(false);
  });

  it('keeps process-report-schedules as the single job', () => {
    expect(existsSync(cron('process-report-schedules'))).toBe(true);
  });
});
