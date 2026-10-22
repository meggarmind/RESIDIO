import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { WhatsAppAdminAction } from '@/lib/whatsapp/admin';
import {
  loadReportableHouses,
  parseStreetChoice,
  queueDebtReportEmail,
  renderDebtStatusReport,
  streetOptions,
} from '@/lib/whatsapp/debt-report';

/** The street list kept with the waiting request: number, id and name only. */
interface ChoiceState extends Record<string, unknown> {
  streets: { number: number; id: string; name: string }[];
}

export const DEBT_REPORT_NO_HOUSES_REPLY = 'There are no houses to report on right now.';
export const DEBT_REPORT_NO_EMAIL_REPLY = 'Your account has no email address, so the report cannot be sent. Nothing was sent.';
export const DEBT_REPORT_FAILED_REPLY = 'The debt status report could not be made, so nothing was sent. Try again later.';
export const DEBT_REPORT_QUEUE_FAILED_REPLY = 'The debt status report could not be sent by email. Try again later.';

/**
 * ADMIN DEBT (#982): the admin picks ALL or streets, approves with a fresh authenticator code, and the
 * debt status PDF (house and status, no amounts or names) is emailed to their account address.
 */
export const debtReportAction: WhatsAppAdminAction = {
  permission: PERMISSIONS.REPORTS_VIEW_FINANCIAL,
  freshCode: true,

  async begin() {
    const options = streetOptions(await loadReportableHouses());
    if (options.length === 0) return { reply: DEBT_REPORT_NO_HOUSES_REPLY, state: { streets: [] } };
    const total = options.reduce((sum, o) => sum + o.houseCount, 0);
    return {
      reply: [
        'Debt status report. Reply ALL or street numbers such as 2,3:',
        ...options.map((o) => `${o.number}. ${o.name} (${o.houseCount} houses)`),
        `ALL. Whole estate (${total} houses)`,
      ].join('\n'),
      state: { streets: options.map(({ number, id, name }) => ({ number, id, name })) } satisfies ChoiceState,
    };
  },

  choose(text, state) {
    const streets = (state as ChoiceState).streets ?? [];
    const choice = parseStreetChoice(text);
    if (!choice) return { retry: 'Reply ALL or street numbers from the list, such as 2,3.' };
    if (choice.all) return { params: { all: true, streetIds: [] } };
    const unknown = choice.numbers.filter((n) => !streets.some((s) => s.number === n));
    if (unknown.length > 0) return { retry: `There is no street ${unknown.join(', ')} in the list. Reply ALL or street numbers from the list.` };
    return { params: { all: false, streetIds: streets.filter((s) => choice.numbers.includes(s.number)).map((s) => s.id) } };
  },

  async run({ account, params }) {
    const scope = { all: params.all === true, streetIds: Array.isArray(params.streetIds) ? (params.streetIds as string[]) : [] };
    const audit = { scope: scope.all ? 'ALL' : scope.streetIds };
    const email = account.email?.trim();
    if (!email) return { reply: DEBT_REPORT_NO_EMAIL_REPLY, audit: { ...audit, outcome: 'no_email' } };

    let report;
    try {
      report = await renderDebtStatusReport(scope);
    } catch (error) {
      // No text fallback: a report that cannot be drawn is not sent in any form.
      console.error('[whatsapp-admin] Debt status report failed:', error instanceof Error ? error.message : error);
      return { reply: DEBT_REPORT_FAILED_REPLY, audit: { ...audit, outcome: 'pdf_failed' } };
    }
    if (report.houseCount === 0) return { reply: DEBT_REPORT_NO_HOUSES_REPLY, audit: { ...audit, outcome: 'no_houses' } };

    try {
      await queueDebtReportEmail({ profileId: account.profileId, email, fullName: account.fullName, scope, scopeLabel: report.scopeLabel });
    } catch (error) {
      console.error('[whatsapp-admin] Debt status report email could not be queued:', error instanceof Error ? error.message : error);
      return { reply: DEBT_REPORT_QUEUE_FAILED_REPLY, audit: { ...audit, outcome: 'queue_failed' } };
    }
    return {
      reply: `The debt status report for ${report.scopeLabel} (${report.houseCount} houses) is on its way to ${email}.`,
      audit: { ...audit, outcome: 'queued', house_count: report.houseCount },
    };
  },
};
