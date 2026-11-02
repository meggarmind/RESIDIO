import { PERMISSIONS } from '@/lib/auth/action-roles';
import { exceedsEmailAutoProcessLimit, extractSenderName } from '@/lib/email-imports/utils';
import { formatDay, lagosParts } from '@/lib/whatsapp/assistant-format';
import {
  createUnverifiedPaymentsRepository,
  type HouseCandidate,
  type UnverifiedAlert,
  type UnverifiedPayment,
  type UnverifiedPaymentsRepository,
} from '@/lib/whatsapp/admin-unverified-payments-db';
import type { WhatsAppAdminAccount, WhatsAppAdminAction, ChooseResult } from '@/lib/whatsapp/admin';

/**
 * Unverified payments (#1424, Admin tools item 6, owner pick Option A on 2 Nov 2026): one numbered
 * list of the bank alerts with no resident (🏦, the email-import review queue) and the payments with
 * no bank proof (🧾), oldest first. The admin picks a number, sees the details, and settles the item
 * one question at a time. The numbers stay the same until the admin opens item 6 again.
 *
 * A payment needs a resident check and bank proof (owner rule, 2 Nov 2026). Giving an alert to a
 * house records a verified payment when the alert's email passed the sender check: the alert is the
 * bank proof, the admin's pick the resident check. An alert whose email did not pass is no bank proof,
 * so its payment is recorded unverified and an alert link refuses it (#1428).
 * Every write re-checks the live account's permissions first and is audited with the admin as actor.
 */

export const PAGE_SIZE = 9;
export const NOT_ESTATE_MONEY_REASON = 'Not estate money (WhatsApp admin)';
export const NO_ITEMS_REPLY = 'There are no unverified payments.';
export const HOUSE_PROMPT = "Send the house code or part of the resident's name.\nExamples: IBB-3AF-4 or MARTINS";
export const STATEMENT_PROMPT = 'Send the statement date and the bank text. Example: 23 Oct 2026 TRF FROM SUSAN BADIRU';
export const ALERT_PROMPT = 'Reply 1 Give to a house, 2 Not estate money, 0 Back.';
export const PAYMENT_PROMPT = 'Reply 1 Bank statement shows it, 2 Link a bank alert, 0 Back.';
export const HOUSE_CONFIRM_PROMPT = 'Reply 1 Yes, 2 Yes but do not save the payer name, 0 Back.';
export const YES_PROMPT = 'Reply 1 Yes, 0 Back.';

/** Every permission the item needs, on top of whatsapp_admin.query; checked again on the live account before a write. */
export const UNVERIFIED_PAYMENTS_ALSO_REQUIRES = [PERMISSIONS.PAYMENTS_VERIFY, PERMISSIONS.PAYMENTS_CREATE, PERMISSIONS.EMAIL_IMPORTS_PROCESS];
const LIVE_REQUIRED = [PERMISSIONS.WHATSAPP_ADMIN_UNVERIFIED_PAYMENTS, ...UNVERIFIED_PAYMENTS_ALSO_REQUIRES];

const repo = () => createUnverifiedPaymentsRepository();

// ---------------------------------------------------------------------------
// Text

/** `₦65,000`, with kobo only when there are some. */
export function naira(amount: number): string {
  const kobo = Math.round(amount * 100) % 100 !== 0;
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: kobo ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** `23 Oct` for a day in the current Lagos year, else `23 Oct 2025`. */
export function shortDay(day: string, now: Date): string {
  const full = formatDay(day);
  return full.endsWith(` ${lagosParts(now).year}`) ? full.replace(/ \d{4}$/, '') : full;
}

/**
 * The name parts of a bank alert's text: the parts after the transfer code (`FIP:ZIB`, `CPWInward:1000…`),
 * leaving out short bank codes and parts with digits. `FIP:ZIB/HENRY/ Henry Itoki` gives `HENRY`, `HENRY ITOKI`.
 * The first part is `CODE:NAME` when the bank gives no `/` after the code (#1433): `FBNMOBILE:ISIMAH NKECHI RACHEAL/For 2 months`
 * gives `ISIMAH NKECHI RACHEAL`.
 */
function payerParts(description: string | null): string[] {
  if (!description) return [];
  const [first, ...rest] = description.split('/');
  const afterCode = first.includes(':') ? first.slice(first.indexOf(':') + 1) : '';
  return [afterCode, ...rest]
    .map((part) => part.trim().replace(/\s+/g, ' ').toUpperCase())
    .filter((part) => part.length >= 2 && !/\d/.test(part) && !/^[A-Z]{1,3}$/.test(part));
}

/**
 * The payer name to look up and save as an alias: the first name part, or the next part when it is the
 * same name written longer (`HENRY` then `HENRY ITOKI`). Falls back to the dashboard's extractSenderName.
 */
export function aliasName(description: string | null): string | null {
  const [first, next] = payerParts(description);
  if (first) return next && next.length > first.length && next.startsWith(`${first.split(' ')[0]} `) ? next : first;
  return description ? extractSenderName(description) : null;
}

/** The payer as the list and the messages name them, in capitals (the approved mockup): the alias name. */
function payerLabel(description: string | null): string {
  return (aliasName(description) || description || 'Unknown payer').toUpperCase();
}

const items = (count: number) => `${count} item${count === 1 ? '' : 's'}`;

// ---------------------------------------------------------------------------
// State

type Kind = 'alert' | 'payment';

export interface ListEntry {
  number: number;
  kind: Kind;
  id: string;
  amount: number;
  /** The list line, kept so the numbers stay the same until item 6 is opened again. */
  line: string;
}

type Step =
  | { name: 'alert'; number: number }
  | { name: 'house'; number: number; text?: string; matches?: HouseCandidate[]; page?: number }
  | { name: 'confirm_house'; number: number; houseId: string; houseCode: string; residentId: string; resident: string }
  | { name: 'not_estate'; number: number }
  | { name: 'payment'; number: number }
  | { name: 'statement'; number: number }
  | { name: 'link'; number: number };

export interface ListState extends Record<string, unknown> {
  entries: ListEntry[];
  /** The page on screen, from 0. */
  page: number;
  /** Numbers settled since the list was opened. */
  settled: number[];
  /** The account may record an alert over the email auto-process limit (imports.approve or super admin). */
  overLimit: boolean;
  step?: Step;
}

function listOf(state: Record<string, unknown>): ListState {
  const s = state as Partial<ListState>;
  return { entries: s.entries ?? [], page: s.page ?? 0, settled: s.settled ?? [], overLimit: s.overLimit === true };
}

const open = (list: ListState) => list.entries.filter((e) => !list.settled.includes(e.number));
const pageCount = (list: ListState) => Math.ceil(list.entries.length / PAGE_SIZE);

function pageText(list: ListState): string {
  const shown = list.entries.slice(list.page * PAGE_SIZE, (list.page + 1) * PAGE_SIZE).filter((e) => !list.settled.includes(e.number));
  const more = list.page + 1 < pageCount(list);
  return [
    ...shown.map((e) => e.line),
    '',
    more ? 'Reply a number to see one. M for more. 0 for Admin tools.' : 'Reply a number to see one. 0 for Admin tools.',
  ].join('\n');
}

const staleReply = (number: number) => `Item ${number} is already settled. Reply another number, or 0 for Admin tools.`;

/** The numbers in the list of the other kind with the same amount. */
function sameAmount(list: ListState, kind: Kind, amount: number): ListEntry[] {
  return open(list).filter((e) => e.kind === kind && e.amount === amount);
}

const numbers = (entries: ListEntry[]) => (entries.length ? entries.map((e) => e.number).join(', ') : 'none');

// ---------------------------------------------------------------------------
// The list

export function composeList(alerts: UnverifiedAlert[], payments: UnverifiedPayment[], now: Date): { reply: string; entries: ListEntry[] } {
  const merged = [
    ...payments.map((p) => ({ kind: 'payment' as const, id: p.id, amount: p.amount, date: p.date, createdAt: p.createdAt, who: `${p.houseCode} ${p.resident}` })),
    ...alerts.map((a) => ({ kind: 'alert' as const, id: a.id, amount: a.amount, date: a.date, createdAt: a.createdAt, who: payerLabel(a.description) })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const entries = merged.map((item, index) => ({
    number: index + 1,
    kind: item.kind,
    id: item.id,
    amount: item.amount,
    line: `${index + 1}. ${item.kind === 'alert' ? '🏦' : '🧾'} ${naira(item.amount)}, ${shortDay(item.date, now)}, ${item.who}`,
  }));
  const total = merged.reduce((sum, item) => sum + item.amount, 0);
  const reply = [
    `Unverified payments: ${items(entries.length)}, ${naira(total)}.`,
    '🧾 = recorded from a receipt, no bank proof.',
    '🏦 = bank alert, no resident.',
    '',
    pageText({ entries, page: 0, settled: [], overLimit: false }),
  ].join('\n');
  return { reply, entries };
}

/** `<n> items left`, counted again so an item settled elsewhere is not counted. */
async function leftPrompt(): Promise<string> {
  const r = repo();
  const [alerts, payments] = await Promise.all([r.listAlerts(), r.listPayments()]);
  const left = alerts.length + payments.length;
  return left === 0 ? 'No unverified payments left. Reply 0 for Admin tools.' : `${items(left)} left. Reply a number, or 0 for Admin tools.`;
}

// ---------------------------------------------------------------------------
// Details

async function alertDetails(list: ListState, number: number, alert: UnverifiedAlert): Promise<string> {
  const name = aliasName(alert.description);
  const known = name ? await repo().findPayerAlias(name) : null;
  return [
    `🏦 Bank alert ${number}: no resident yet`,
    `Amount: ${naira(alert.amount)}`,
    `Date: ${formatDay(alert.date)}`,
    `Bank text: ${alert.description || 'None'}`,
    `Bank email checked: ${alert.senderVerified ? 'yes' : 'no'}`,
    `Known payer name: ${known ? `matches ${known}` : 'no match'}`,
    `Payments with the same amount: ${numbers(sameAmount(list, 'payment', alert.amount))}`,
    '',
    ALERT_PROMPT,
  ].join('\n');
}

function paymentDetails(list: ListState, number: number, payment: UnverifiedPayment): string {
  return [
    `🧾 Payment ${number}: no bank proof yet`,
    `House: ${payment.houseCode}`,
    `Resident: ${payment.resident}`,
    `Amount: ${naira(payment.amount)}, paid ${formatDay(payment.date)}`,
    `Source: ${payment.notes?.split('\n')[0]?.trim() || 'Not given'}`,
    `Bank alerts with the same amount: ${numbers(sameAmount(list, 'alert', payment.amount))}`,
    '',
    PAYMENT_PROMPT,
  ].join('\n');
}

const ROLE_WORDS: Record<string, string> = { tenant: 'tenant', resident_landlord: 'landlord', non_resident_landlord: 'landlord', co_resident: 'co-resident' };

/** A name search, 9 lines to a page, numbered through the pages like the main list (#1433). */
function matchesText(text: string, matches: HouseCandidate[], page: number): string {
  const lines = matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((m, i) => `${page * PAGE_SIZE + i + 1}. ${m.code} ${m.resident}, ${ROLE_WORDS[m.role] ?? m.role}`);
  const more = (page + 1) * PAGE_SIZE < matches.length;
  return [
    `${matches.length} ${matches.length === 1 ? 'house matches' : 'houses match'} "${text}":`,
    ...lines,
    more ? 'Reply a number, or send another name or code. M for more. 0 Back.' : 'Reply a number, or send another name or code. 0 Back.',
  ].join('\n');
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** `23 Oct 2026 TRF FROM ...` as a `YYYY-MM-DD` day and the bank text as typed; null when it does not read. */
export function parseStatementLine(text: string): { day: string; text: string } | null {
  const match = text.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})[\s,:-]+(\S[\s\S]*)$/);
  if (!match) return null;
  const month = MONTHS.indexOf(match[2].slice(0, 3).toLowerCase()) + 1;
  const [day, year] = [Number(match[1]), Number(match[3])];
  if (month === 0 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  return { day: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, text: match[4].trim() };
}

// ---------------------------------------------------------------------------
// choose: one question at a time

const ask = (text: string, list: ListState, step?: Step): ChooseResult => ({ ask: text, state: { ...list, ...(step ? { step } : {}) } });

async function chooseFromList(text: string, list: ListState): Promise<ChooseResult> {
  if (text.toLowerCase() === 'm') {
    if (list.page + 1 >= pageCount(list)) return { retry: 'There are no more items. Reply a number, or 0 for Admin tools.' };
    const next = { ...list, page: list.page + 1 };
    return ask(pageText(next), next);
  }
  const entry = list.entries.find((e) => String(e.number) === text);
  if (!entry) return { retry: 'Reply a number from the list, or 0 for Admin tools.' };
  if (list.settled.includes(entry.number)) return { retry: staleReply(entry.number) };
  if (entry.kind === 'alert') {
    const alert = await repo().getAlert(entry.id);
    if (!alert) return { retry: staleReply(entry.number) };
    return ask(await alertDetails(list, entry.number, alert), list, { name: 'alert', number: entry.number });
  }
  const payment = await repo().getPayment(entry.id);
  if (!payment) return { retry: staleReply(entry.number) };
  return ask(paymentDetails(list, entry.number, payment), list, { name: 'payment', number: entry.number });
}

async function chooseStep(text: string, list: ListState, step: Step): Promise<ChooseResult> {
  const entry = list.entries.find((e) => e.number === step.number)!;
  switch (step.name) {
    case 'alert': {
      if (text === '2') {
        const alert = await repo().getAlert(entry.id);
        if (!alert) return { retry: staleReply(step.number) };
        return ask(
          `Mark the ${naira(alert.amount)} alert from ${payerLabel(alert.description)} as not estate money? It leaves this list and the review queue. The dashboard keeps a record.\n\n${YES_PROMPT}`,
          list,
          { name: 'not_estate', number: step.number }
        );
      }
      if (text !== '1') return { retry: ALERT_PROMPT };
      if (!list.overLimit) {
        const limit = await repo().autoProcessLimit();
        if (exceedsEmailAutoProcessLimit({ transaction_type: 'credit', amount: entry.amount }, limit)) {
          return { retry: `${overLimitRefusal(limit)} Reply 2 Not estate money, or 0 Back.` };
        }
      }
      return ask(HOUSE_PROMPT, list, { name: 'house', number: step.number });
    }
    case 'house': {
      const alert = await repo().getAlert(entry.id);
      if (!alert) return { retry: staleReply(step.number) };
      const confirm = (house: { houseId: string; code: string; residentId: string; resident: string }) =>
        ask(
          `${house.code}: ${house.resident}.\nRecord ${naira(alert.amount)} for this resident from the ${payerLabel(alert.description)} alert?\n\n${HOUSE_CONFIRM_PROMPT}`,
          list,
          { name: 'confirm_house', number: step.number, houseId: house.houseId, houseCode: house.code, residentId: house.residentId, resident: house.resident }
        );
      const shown = step.matches ?? [];
      // A number picks the resident on that line; M shows the next page of the list on screen.
      if (shown.length > 0 && /^\d+$/.test(text) && Number(text) >= 1 && Number(text) <= shown.length) return confirm(shown[Number(text) - 1]);
      if (shown.length > 0 && text.toLowerCase() === 'm') {
        const page = (step.page ?? 0) + 1;
        if (page * PAGE_SIZE >= shown.length) return { retry: 'There are no more houses. Reply a number, or send another name or code. 0 Back.' };
        return ask(matchesText(step.text ?? '', shown, page), list, { ...step, page });
      }
      const house = await repo().findHouse(text);
      if (house && (!house.residentId || !house.resident)) {
        return { retry: `${house.code} has no tenant or landlord to record the payment for. Send another house code, or 0 Back.` };
      }
      if (house) return confirm({ houseId: house.houseId, code: house.code, residentId: house.residentId!, resident: house.resident! });
      const label = text.trim().replace(/\s+/g, ' ').toUpperCase();
      const found = await repo().searchHouses(text);
      // New text replaces the list on screen, even when nothing matches.
      if (found.length === 0) return ask(`No house matches "${label}". Send another name or code. 0 Back.`, list, { name: 'house', number: step.number });
      return ask(matchesText(label, found, 0), list, { name: 'house', number: step.number, text: label, matches: found, page: 0 });
    }
    case 'confirm_house': {
      if (text !== '1' && text !== '2') return { retry: HOUSE_CONFIRM_PROMPT };
      const { houseId, houseCode, residentId, resident } = step;
      return { params: { op: 'give', number: step.number, houseId, houseCode, residentId, resident, saveAlias: text === '1', list } };
    }
    case 'not_estate':
      if (text !== '1') return { retry: YES_PROMPT };
      return { params: { op: 'skip', number: step.number, list } };
    case 'payment': {
      if (text === '1') return ask(STATEMENT_PROMPT, list, { name: 'statement', number: step.number });
      if (text !== '2') return { retry: PAYMENT_PROMPT };
      const alerts = sameAmount(list, 'alert', entry.amount);
      if (alerts.length === 0) return { retry: 'No bank alert in the list has the same amount. Reply 1 Bank statement shows it, or 0 Back.' };
      return ask(
        ['Bank alerts with the same amount. Reply a number to link one to this payment:', ...alerts.map((e) => e.line), '', '0 Back.'].join('\n'),
        list,
        { name: 'link', number: step.number }
      );
    }
    case 'statement': {
      const line = parseStatementLine(text);
      if (!line) return { retry: STATEMENT_PROMPT };
      return { params: { op: 'statement', number: step.number, day: line.day, text: line.text, list } };
    }
    case 'link': {
      const alert = sameAmount(list, 'alert', entry.amount).find((e) => String(e.number) === text);
      if (!alert) return { retry: 'Reply the number of a bank alert above, or 0 Back.' };
      return { params: { op: 'link', number: step.number, alertNumber: alert.number, list } };
    }
  }
}

function overLimitRefusal(limit: number | null): string {
  const over = limit === null ? 'The approval limit could not be read, so a bank alert' : `A bank alert over ${naira(limit)}`;
  return `${over} needs the ${PERMISSIONS.IMPORTS_APPROVE} permission to record.`;
}

// ---------------------------------------------------------------------------
// run: the writes

export const NO_BANK_PROOF =
  'No bank proof yet: the bank email did not pass the check. The payment stays in this list until a bank statement line or a checked alert proves it.';
export const UNCHECKED_ALERT_REFUSAL =
  'Not done: the bank email of this alert did not pass the check, so it is not bank proof. To verify the payment, pick it again and reply 1 Bank statement shows it.';
const ALERT_NOT_LINKED = 'The alert could not be marked with the payment. Check the review queue on the dashboard.';
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The dashboard review queue's rule (processSingleTransaction), on the live account: the refusal, or null. */
async function overLimitBlock(r: UnverifiedPaymentsRepository, live: string[], account: WhatsAppAdminAccount, amount: number): Promise<string | null> {
  if (live.includes(PERMISSIONS.IMPORTS_APPROVE) || account.roleName === 'super_admin') return null;
  const limit = await r.autoProcessLimit();
  return exceedsEmailAutoProcessLimit({ transaction_type: 'credit', amount }, limit) ? `Not done: ${overLimitRefusal(limit)}` : null;
}

type RunResult ={ reply: string; audit: Record<string, unknown>; next: { state: Record<string, unknown>; prompt: string } };

async function settle(account: WhatsAppAdminAccount, params: Record<string, unknown>): Promise<{ reply: string; outcome: string; settled: number[] }> {
  const r = repo();
  const list = listOf((params.list ?? {}) as Record<string, unknown>);
  const number = Number(params.number);
  const entry = list.entries.find((e) => e.number === number);
  const stale = { reply: `Item ${number} is already settled.`, outcome: 'stale', settled: [number] };
  if (!entry) return { reply: 'That item is not in the list.', outcome: 'not_in_list', settled: [] };

  // The account is read again: a role changed since the list opened must not write.
  const live = await r.livePermissions(account.profileId);
  const missing = LIVE_REQUIRED.find((p) => !live.includes(p));
  if (missing) return { reply: `Not done: this needs the ${missing} permission.`, outcome: 'refused', settled: [] };
  const audit = (entry: Parameters<UnverifiedPaymentsRepository['audit']>[0]) => r.audit(entry, account.profileId);

  switch (params.op) {
    case 'give': {
      const alert = await r.getAlert(entry.id);
      if (!alert) return stale;
      const blocked = await overLimitBlock(r, live, account, alert.amount);
      if (blocked) return { reply: blocked, outcome: 'over_limit', settled: [] };
      const residentId = String(params.residentId);
      const houseCode = String(params.houseCode);
      if (!(await r.claimAlert(alert.id))) return stale;
      const verified = alert.senderVerified;
      let paymentId: string;
      try {
        const recorded = await r.recordPayment(alert, { houseId: String(params.houseId), residentId }, account.profileId, verified);
        if ('error' in recorded) {
          await r.releaseAlert(alert.id);
          return { reply: `Not done: ${recorded.error}`, outcome: 'failed', settled: [] };
        }
        paymentId = recorded.paymentId;
      } catch (error) {
        // The payment may or may not be written: the alert goes back only when no payment has it.
        console.error('[whatsapp-admin] Recording the payment from a bank alert failed:', { alertId: alert.id, error: errorText(error) });
        let written: string | null;
        try {
          written = await r.paymentForAlert(alert.id);
        } catch {
          return { reply: `Not done: ${errorText(error)}. Check the review queue on the dashboard before you try again.`, outcome: 'error_unknown', settled: [] };
        }
        if (!written) {
          await r.releaseAlert(alert.id);
          return { reply: `Not done: ${errorText(error)}. The alert is back in the list.`, outcome: 'error', settled: [] };
        }
        paymentId = written;
      }
      // The payment is written: from here a failure is reported with it, never as a generic error.
      const problems: string[] = [];
      try {
        await r.finishAlert(alert.id, { paymentId, residentId, profileId: account.profileId });
      } catch (error) {
        console.error('[whatsapp-admin] Marking the bank alert processed failed:', { alertId: alert.id, error: errorText(error) });
        problems.push(ALERT_NOT_LINKED);
      }
      const name = aliasName(alert.description);
      let savedAlias = false;
      if (params.saveAlias === true && name && name.length >= 2) {
        try {
          savedAlias = await r.saveAlias(residentId, name, account.profileId);
        } catch (error) {
          console.error('[whatsapp-admin] Saving the payer name failed:', { residentId, error: errorText(error) });
          problems.push(`The payer name ${name} could not be saved.`);
        }
      }
      await audit({
        action: 'APPROVE',
        entityType: 'email_transactions',
        entityId: alert.id,
        entityDisplay: `Transaction: ${alert.description}`,
        newValues: { resident_id: residentId, house: houseCode, payment_id: paymentId, saved_alias: savedAlias, verified, ...(problems.length ? { problems } : {}) },
      });
      return {
        reply: [
          `Done. ${naira(alert.amount)} is recorded for ${houseCode}, ${params.resident}.`,
          verified ? 'The bank alert is the bank proof, so the payment is verified.' : NO_BANK_PROOF,
          'The wallet pays open bills first.',
          ...(savedAlias ? [`${name} is saved as a payer name for ${houseCode}.`] : []),
          ...problems,
        ].join('\n'),
        outcome: problems.length ? 'recorded_with_problems' : 'recorded',
        settled: [number],
      };
    }
    case 'skip': {
      const alert = await r.getAlert(entry.id);
      if (!alert || !(await r.skipAlert(alert.id, NOT_ESTATE_MONEY_REASON, account.profileId))) return stale;
      await audit({
        action: 'REJECT',
        entityType: 'email_transactions',
        entityId: alert.id,
        entityDisplay: `Transaction: ${alert.description}`,
        newValues: { skip_reason: NOT_ESTATE_MONEY_REASON },
      });
      return { reply: `Done. The ${naira(alert.amount)} alert from ${payerLabel(alert.description)} is marked not estate money.`, outcome: 'skipped', settled: [number] };
    }
    case 'statement': {
      const payment = await r.getPayment(entry.id);
      if (!payment) return stale;
      const day = formatDay(String(params.day));
      const text = String(params.text);
      const notes = `${payment.notes || ''}\n[Bank statement]: ${day} ${text}`.trim();
      if (!(await r.verifyPayment(payment.id, { profileId: account.profileId, notes }))) return stale;
      await audit({
        action: 'VERIFY',
        entityType: 'payment_records',
        entityId: payment.id,
        entityDisplay: `Payment ${naira(payment.amount)} for ${payment.houseCode}, ${payment.resident}`,
        oldValues: { is_verified: false },
        newValues: { is_verified: true, verified_by: account.profileId, verification_type: 'bank_statement', statement_date: params.day, statement_text: text },
      });
      return {
        reply: `Done. ${naira(payment.amount)} for ${payment.houseCode}, ${payment.resident}, is now verified.\nBank proof saved: statement ${day}, "${text}".`,
        outcome: 'verified',
        settled: [number],
      };
    }
    case 'link': {
      const alertEntry = list.entries.find((e) => e.number === Number(params.alertNumber) && e.kind === 'alert');
      const [payment, alert] = await Promise.all([r.getPayment(entry.id), alertEntry ? r.getAlert(alertEntry.id) : null]);
      if (!payment) return stale;
      if (!alert || !alertEntry) return { ...stale, reply: `Item ${params.alertNumber} is already settled.`, settled: alertEntry ? [alertEntry.number] : [] };
      if (alert.amount !== payment.amount) return { reply: 'Not done: the bank alert and the payment have different amounts.', outcome: 'refused', settled: [] };
      if (!alert.senderVerified) return { reply: UNCHECKED_ALERT_REFUSAL, outcome: 'refused', settled: [] };
      const blocked = await overLimitBlock(r, live, account, alert.amount);
      if (blocked) return { reply: blocked, outcome: 'over_limit', settled: [] };
      if (!(await r.claimAlert(alert.id))) return { ...stale, reply: `Item ${alertEntry.number} is already settled.`, settled: [alertEntry.number] };
      try {
        if (!(await r.verifyPayment(payment.id, { profileId: account.profileId, notes: payment.notes, emailTransactionId: alert.id }))) {
          await r.releaseAlert(alert.id);
          return stale;
        }
      } catch (error) {
        // The alert goes back only when the payment is still unverified, so it is never lost.
        console.error('[whatsapp-admin] Verifying the payment from a bank alert failed:', { paymentId: payment.id, error: errorText(error) });
        let unverified: boolean;
        try {
          unverified = !!(await r.getPayment(payment.id));
        } catch {
          return { reply: `Not done: ${errorText(error)}. Check the payment and the review queue on the dashboard.`, outcome: 'error_unknown', settled: [] };
        }
        if (unverified) {
          await r.releaseAlert(alert.id);
          return { reply: `Not done: ${errorText(error)}. The alert is back in the list.`, outcome: 'error', settled: [] };
        }
      }
      const problems: string[] = [];
      try {
        await r.finishAlert(alert.id, { paymentId: payment.id, residentId: payment.residentId, profileId: account.profileId });
      } catch (error) {
        console.error('[whatsapp-admin] Marking the bank alert processed failed:', { alertId: alert.id, error: errorText(error) });
        problems.push(ALERT_NOT_LINKED);
      }
      await audit({
        action: 'VERIFY',
        entityType: 'payment_records',
        entityId: payment.id,
        entityDisplay: `Payment ${naira(payment.amount)} for ${payment.houseCode}, ${payment.resident}`,
        oldValues: { is_verified: false },
        newValues: { is_verified: true, verified_by: account.profileId, verification_type: 'bank_alert', email_transaction_id: alert.id },
      });
      await audit({
        action: 'APPROVE',
        entityType: 'email_transactions',
        entityId: alert.id,
        entityDisplay: `Transaction: ${alert.description}`,
        newValues: { resident_id: payment.residentId, payment_id: payment.id, linked_to_existing_payment: true, ...(problems.length ? { problems } : {}) },
      });
      return {
        reply: [
          `Done. ${naira(payment.amount)} for ${payment.houseCode}, ${payment.resident}, is now verified.`,
          `Bank proof: the ${naira(alert.amount)} alert from ${payerLabel(alert.description)}, ${formatDay(alert.date)}. No second payment is recorded.`,
          ...problems,
        ].join('\n'),
        outcome: problems.length ? 'linked_with_problems' : 'linked',
        settled: [number, alertEntry.number],
      };
    }
  }
  return { reply: 'That item is not in the list.', outcome: 'unknown_op', settled: [] };
}

export const unverifiedPaymentsAction: WhatsAppAdminAction = {
  label: 'Unverified payments',
  icon: '🔎',
  permission: PERMISSIONS.WHATSAPP_ADMIN_UNVERIFIED_PAYMENTS,
  alsoRequires: UNVERIFIED_PAYMENTS_ALSO_REQUIRES,
  // As item 5: with the code on, the session code is enough.
  freshCode: false,

  async begin({ account, now }) {
    const r = repo();
    const [alerts, payments] = await Promise.all([r.listAlerts(), r.listPayments()]);
    if (alerts.length + payments.length === 0) return { reply: NO_ITEMS_REPLY };
    const { reply, entries } = composeList(alerts, payments, now);
    const overLimit = account.permissions.includes(PERMISSIONS.IMPORTS_APPROVE) || account.roleName === 'super_admin';
    return { reply, state: { entries, page: 0, settled: [], overLimit } satisfies ListState };
  },

  async choose(text, state) {
    const list = listOf(state);
    const step = (state as Partial<ListState>).step;
    return step ? chooseStep(text, list, step) : chooseFromList(text, list);
  },

  async back(state) {
    // 0 on a detail or a question goes back to the list; 0 on the list goes to Admin tools.
    const step = (state as Partial<ListState>).step;
    if (!step) return null;
    const list = listOf(state);
    // 0 on the house question goes back to the alert detail (#1433).
    if (step.name === 'house') {
      const entry = list.entries.find((e) => e.number === step.number);
      const alert = entry ? await repo().getAlert(entry.id) : null;
      if (alert) return { reply: await alertDetails(list, step.number, alert), state: { ...list, step: { name: 'alert', number: step.number } } };
    }
    const reply = open(list).length === 0 ? 'No unverified payments left in this list. Reply 0 for Admin tools.' : pageText(list);
    return { reply, state: list };
  },

  async run({ account, params }): Promise<RunResult> {
    const list = listOf((params.list ?? {}) as Record<string, unknown>);
    const result = await settle(account, params);
    const next = { ...list, settled: [...new Set([...list.settled, ...result.settled])] };
    return {
      reply: result.reply,
      audit: { op: params.op, number: params.number, outcome: result.outcome },
      next: { state: next, prompt: await leftPrompt() },
    };
  },
};
