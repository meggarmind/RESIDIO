import { randomInt } from 'node:crypto';

/**
 * Approve sign-ins on WhatsApp (#1389, parent #1388). Node runtime only.
 *
 * After the password, the verify page shows a 2-digit number. The bot sends a WhatsApp poll with
 * that number, 2 decoys in random order and "This is not me". Tapping the right number approves;
 * typing the same number (or NO) in the chat from the linked phone works the same. The page polls
 * for the result, and on approval the server sets the normal residio_2fa marker for the same login
 * session only, once.
 *
 * This module holds the rules. The database and the WhatsApp sends are injected
 * (`TwoFactorWhatsAppDeps`), so the rules are tested without a network; the Supabase-backed
 * implementation is in `two-factor-whatsapp-store.ts`.
 */

export const WHATSAPP_APPROVAL_TTL_MS = 2 * 60 * 1000;
export const WHATSAPP_APPROVAL_MAX_REQUESTS = 5;
export const WHATSAPP_APPROVAL_WINDOW_MS = 15 * 60 * 1000;

export const NOT_ME_OPTION = 'This is not me';

export const SIGN_IN_APPROVED_REPLY = 'Sign-in approved. You can go back to the sign-in page.';
export const SIGN_IN_BLOCKED_REPLY =
  'Sign-in blocked. Nobody was signed in to your Residio account. If this was not you, change your password now.';
export const SIGN_IN_EXPIRED_REPLY = 'That sign-in request has expired. Start again on the sign-in page.';

export type WhatsAppApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'superseded';
export type WhatsAppApprovalVia = 'poll' | 'text';

export interface WhatsAppApprovalRequest {
  id: string;
  profileId: string;
  sessionId: string;
  matchCode: string;
  decoyCodes: string[];
  pollMessageId: string | null;
  status: WhatsAppApprovalStatus;
  createdAt: string;
  expiresAt: string;
  markerIssuedAt: string | null;
}

/** What the start path needs to know about the signed-in account. */
export interface WhatsAppApprovalAccount {
  profileId: string;
  fullName: string;
  email: string | null;
  roleName: string | null;
  twoFactorEnabled: boolean;
  twoFactorMethod: string | null;
  /** The active WhatsApp binding's number, or null when no number is linked. */
  phoneNumber: string | null;
  /** The admin's "Approve sign-ins on WhatsApp" switch on that binding. */
  approveSignIns: boolean;
}

export type TwoFactorAuditEvent =
  | 'whatsapp_approval_requested'
  | 'whatsapp_approval_approved'
  | 'whatsapp_approval_denied'
  | 'whatsapp_approval_expired';

export interface TwoFactorWhatsAppRepository {
  loadAccount(profileId: string): Promise<WhatsAppApprovalAccount | null>;
  /** The profile whose active binding holds this number, or null. */
  findProfileByPhone(phoneNumber: string): Promise<string | null>;
  countRequestsSince(profileId: string, since: Date): Promise<number>;
  /** Marks the profile's pending requests superseded: all of them, or only this login session's. */
  supersedePending(profileId: string, now: Date, sessionId?: string): Promise<void>;
  insertRequest(input: {
    profileId: string;
    sessionId: string;
    matchCode: string;
    decoyCodes: string[];
    userAgentSummary: string | null;
  }): Promise<WhatsAppApprovalRequest>;
  setPollMessage(requestId: string, messageId: string, messageKey: string): Promise<void>;
  /** The newest pending request of the profile created after `since`. */
  findPendingForProfile(profileId: string, since: Date): Promise<WhatsAppApprovalRequest | null>;
  findPendingByPollKey(pollMessageKey: string): Promise<WhatsAppApprovalRequest | null>;
  /** The newest request of this profile for this login session. */
  findLatestForSession(profileId: string, sessionId: string): Promise<WhatsAppApprovalRequest | null>;
  /** Moves a pending request to `status`. True only for the call that moved it. */
  decide(requestId: string, status: 'approved' | 'denied' | 'expired', via: WhatsAppApprovalVia | null, now: Date): Promise<boolean>;
  /** Sets marker_issued_at on an approved request once. True only for the call that set it. */
  claimMarker(requestId: string, now: Date): Promise<boolean>;
  releaseMarker(requestId: string): Promise<void>;
  logEvent(profileId: string, event: TwoFactorAuditEvent, method: string | null, metadata: Record<string, unknown>): Promise<void>;
}

export interface TwoFactorWhatsAppSender {
  sendPoll(to: string, name: string, options: string[]): Promise<{ success: boolean; messageId?: string; error?: string }>;
  sendText(to: string, body: string): Promise<void>;
  /** Tells the Chairman a sign-in was blocked: WhatsApp, or email when the admin is the Chairman. Never throws. */
  alertChairman(account: WhatsAppApprovalAccount, at: Date): Promise<void>;
}

export interface TwoFactorWhatsAppDeps {
  repository: TwoFactorWhatsAppRepository;
  sender: TwoFactorWhatsAppSender;
  now?: () => Date;
  /** For tests: picks the codes and their order. Defaults to crypto.randomInt. */
  random?: (min: number, max: number) => number;
}

const clock = (deps: TwoFactorWhatsAppDeps) => (deps.now ? deps.now() : new Date());

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

/** Same number when the digits match: `+2348...`, `2348...@c.us` and `2348...` are one phone. */
export function samePhoneNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const da = digits(a);
  return da.length >= 7 && da === digits(b);
}

/** The 2-digit match code and 2 different decoys, each 10 to 99. */
export function pickCodes(random: (min: number, max: number) => number = randomInt): { matchCode: string; decoyCodes: string[] } {
  const picked: string[] = [];
  while (picked.length < 3) {
    const code = String(random(10, 100));
    if (!picked.includes(code)) picked.push(code);
  }
  return { matchCode: picked[0], decoyCodes: picked.slice(1) };
}

/** The 3 numbers in random order, then "This is not me". */
export function pollOptions(matchCode: string, decoyCodes: string[], random: (min: number, max: number) => number = randomInt): string[] {
  const numbers = [matchCode, ...decoyCodes];
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = random(0, i + 1);
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }
  return [...numbers, NOT_ME_OPTION];
}

/** "Chrome on Windows" from a user agent, or null when nothing is known. */
export function summarizeUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : null;
  const os = /iPhone|iPad/.test(userAgent)
    ? 'iPhone'
    : /Android/.test(userAgent)
      ? 'Android'
      : /Windows/.test(userAgent)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(userAgent)
          ? 'Mac'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os;
}

/** Lagos time as HH:MM. */
export function lagosClock(at: Date): string {
  return at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Lagos' });
}

export function pollName(device: string | null, at: Date): string {
  return `Sign-in request: ${device ?? 'a web browser'}, ${lagosClock(at)}. Tap the number on your screen.`;
}

/** The last `_` segment of a WAHA message id (`true_<chat>_<key>`), the part both engines agree on. */
export function messageKeyOf(messageId: string): string {
  const parts = messageId.split('_');
  return parts[parts.length - 1] || messageId;
}

function isExpired(request: WhatsAppApprovalRequest, now: Date): boolean {
  return now.getTime() >= Date.parse(request.expiresAt);
}

// ---------------------------------------------------------------------------
// Start

export type StartWhatsAppApprovalResult =
  | { available: false }
  | { available: true; success: false; message: string }
  | { available: true; success: true; code: string; expiresAt: string; pollSent: boolean; message: string };

/**
 * Creates a request for the signed-in user's login session and sends the poll. The caller passes
 * the identity from the session cookie, never from a request body (#455).
 * If the poll cannot be sent, the request stays open for a typed reply and the message says so.
 */
export async function startWhatsAppApproval(
  ctx: { userId: string; sessionId: string | null; userAgent: string | null },
  deps: TwoFactorWhatsAppDeps
): Promise<StartWhatsAppApprovalResult> {
  const { repository, sender } = deps;
  const account = await repository.loadAccount(ctx.userId);
  if (!account || !account.twoFactorEnabled || !account.phoneNumber || !account.approveSignIns) {
    return { available: false };
  }
  if (!ctx.sessionId) {
    return { available: true, success: false, message: 'Your sign-in session is not ready. Sign in again.' };
  }

  const now = clock(deps);
  const recent = await repository.countRequestsSince(ctx.userId, new Date(now.getTime() - WHATSAPP_APPROVAL_WINDOW_MS));
  if (recent >= WHATSAPP_APPROVAL_MAX_REQUESTS) {
    return {
      available: true,
      success: false,
      message: 'Too many WhatsApp requests. Wait 15 minutes, or use your authenticator code.',
    };
  }

  await repository.supersedePending(ctx.userId, now);
  const { matchCode, decoyCodes } = pickCodes(deps.random);
  const device = summarizeUserAgent(ctx.userAgent);
  const request = await repository.insertRequest({
    profileId: ctx.userId,
    sessionId: ctx.sessionId,
    matchCode,
    decoyCodes,
    userAgentSummary: device,
  });

  let pollSent = false;
  let sendError: string | undefined;
  try {
    const sent = await sender.sendPoll(account.phoneNumber, pollName(device, now), pollOptions(matchCode, decoyCodes, deps.random));
    if (sent.success && sent.messageId) {
      await repository.setPollMessage(request.id, sent.messageId, messageKeyOf(sent.messageId));
      pollSent = true;
    } else {
      sendError = sent.error ?? 'no message id';
    }
  } catch (error) {
    sendError = error instanceof Error ? error.message : 'send failed';
  }
  if (sendError) console.error('[2FA WhatsApp] Poll not sent; the typed reply still works:', sendError);

  await repository.logEvent(ctx.userId, 'whatsapp_approval_requested', account.twoFactorMethod, {
    request_id: request.id,
    poll_sent: pollSent,
    device,
  });

  return {
    available: true,
    success: true,
    code: matchCode,
    expiresAt: request.expiresAt,
    pollSent,
    message: pollSent
      ? `Tap this number in WhatsApp. If you cannot tap, type ${matchCode} in the chat.`
      : `We could not send the WhatsApp message. Type ${matchCode} in your chat with the estate WhatsApp number, or use your authenticator code.`,
  };
}

// ---------------------------------------------------------------------------
// Answers

type Answer = { kind: 'code'; code: string } | { kind: 'not_me' };

/** A notice to the admin. Best effort: the decision is already stored and logged. */
async function notifyAdmin(deps: TwoFactorWhatsAppDeps, to: string, body: string): Promise<void> {
  try {
    await deps.sender.sendText(to, body);
  } catch (error) {
    console.error('[2FA WhatsApp] Could not send a notice to the admin:', error instanceof Error ? error.message : error);
  }
}

/**
 * Applies one answer to a pending request: the right number approves, a decoy or "not me" denies.
 * The voter phone must be the number of the request owner's active binding.
 */
async function applyAnswer(
  request: WhatsAppApprovalRequest,
  voterPhone: string,
  answer: Answer,
  via: WhatsAppApprovalVia,
  deps: TwoFactorWhatsAppDeps
): Promise<'approved' | 'denied' | 'expired' | 'ignored'> {
  const { repository, sender } = deps;
  const now = clock(deps);
  const account = await repository.loadAccount(request.profileId);
  if (!account?.phoneNumber || !samePhoneNumber(account.phoneNumber, voterPhone)) return 'ignored';

  if (isExpired(request, now)) {
    if (await repository.decide(request.id, 'expired', null, now)) {
      await repository.logEvent(request.profileId, 'whatsapp_approval_expired', account.twoFactorMethod, { request_id: request.id, via });
    }
    await notifyAdmin(deps, account.phoneNumber, SIGN_IN_EXPIRED_REPLY);
    return 'expired';
  }

  const approve = answer.kind === 'code' && answer.code === request.matchCode;
  if (!approve && answer.kind === 'code' && !request.decoyCodes.includes(answer.code) && via === 'poll') {
    // A poll option that is not one of ours: not an answer to this request.
    return 'ignored';
  }

  const status = approve ? 'approved' : 'denied';
  if (!(await repository.decide(request.id, status, via, now))) return 'ignored';

  if (approve) {
    await repository.logEvent(request.profileId, 'whatsapp_approval_approved', account.twoFactorMethod, { request_id: request.id, via });
    await notifyAdmin(deps, account.phoneNumber, SIGN_IN_APPROVED_REPLY);
    return 'approved';
  }

  await repository.logEvent(request.profileId, 'whatsapp_approval_denied', account.twoFactorMethod, {
    request_id: request.id,
    via,
    reason: answer.kind === 'not_me' ? 'not_me' : 'wrong_number',
  });
  await notifyAdmin(deps, account.phoneNumber, SIGN_IN_BLOCKED_REPLY);
  await sender.alertChairman(account, now);
  return 'denied';
}

/** The text of a poll option from WEBJS (a string) or NOWEB (`{ name }`). */
function optionText(option: unknown): string | null {
  if (typeof option === 'string') return option;
  const name = (option as { name?: unknown } | null)?.name;
  return typeof name === 'string' ? name : null;
}

/**
 * A `poll.vote` answer. `pollMessageId` is the voted poll's id; `voterPhone` is the voter's number,
 * already resolved from an @lid by the caller. Votes for other polls, empty votes (a vote taken back)
 * and votes from a phone that is not the owner's binding are ignored.
 */
export async function answerWhatsAppApprovalVote(
  input: { pollMessageId: string; voterPhone: string; selectedOptions: unknown[] },
  deps: TwoFactorWhatsAppDeps
): Promise<'approved' | 'denied' | 'expired' | 'ignored'> {
  const selected = input.selectedOptions.map(optionText).filter((text): text is string => !!text);
  if (selected.length !== 1) return 'ignored';
  const request = await deps.repository.findPendingByPollKey(messageKeyOf(input.pollMessageId));
  if (!request) return 'ignored';
  const choice = selected[0].trim();
  let answer: Answer;
  if (choice === NOT_ME_OPTION) answer = { kind: 'not_me' };
  else if (/^\d{2}$/.test(choice)) answer = { kind: 'code', code: choice };
  else return 'ignored';
  return applyAnswer(request, input.voterPhone, answer, 'poll', deps);
}

/** A typed answer: exactly 2 digits, or NO / not me. Anything else is not an answer. */
export function parseTypedAnswer(text: string | null | undefined): Answer | null {
  const value = (text ?? '').trim().replace(/[.!]+$/, '').trim();
  if (/^\d{2}$/.test(value)) return { kind: 'code', code: value };
  if (/^(no|not me|this is not me)$/i.test(value)) return { kind: 'not_me' };
  return null;
}

/**
 * A typed reply in the chat. Runs BEFORE the resident menu and admin mode: when the sender's phone
 * owns a pending, unexpired sign-in request, a 2-digit number or NO is the answer and is consumed
 * here (true), so it never reaches the menu (on 29 Oct a bare "1" went to the open resident session).
 * False means "not a sign-in answer": the message goes on to the menu as before. A request past its
 * 2 minutes does not take the reply: it is marked expired quietly and the reply goes to the menu.
 */
export async function consumeWhatsAppApprovalReply(
  message: { from: string; text: string | null },
  deps: TwoFactorWhatsAppDeps
): Promise<boolean> {
  const answer = parseTypedAnswer(message.text);
  if (!answer) return false;
  const profileId = await deps.repository.findProfileByPhone(message.from);
  if (!profileId) return false;
  const now = clock(deps);
  const request = await deps.repository.findPendingForProfile(profileId, new Date(now.getTime() - WHATSAPP_APPROVAL_TTL_MS));
  if (!request) return false;
  if (isExpired(request, now)) {
    if (await deps.repository.decide(request.id, 'expired', null, now)) {
      await deps.repository.logEvent(request.profileId, 'whatsapp_approval_expired', null, { request_id: request.id, via: 'text' });
    }
    return false;
  }
  const outcome = await applyAnswer(request, message.from, answer, 'text', deps);
  return outcome !== 'ignored';
}

/**
 * Closes the open request of this login session when the second factor was completed another way
 * (authenticator code, backup code) or the user cancelled. No deny, no notice, no alert: a later
 * answer then finds no request, so it goes to the menu and nobody is told of a block that did not happen.
 * Without a session id, every open request of the profile is closed.
 */
export async function closeWhatsAppApproval(
  ctx: { userId: string; sessionId: string | null },
  deps: TwoFactorWhatsAppDeps
): Promise<void> {
  await deps.repository.supersedePending(ctx.userId, clock(deps), ctx.sessionId ?? undefined);
}

// ---------------------------------------------------------------------------
// Status

export type WhatsAppApprovalStatusResult =
  | { status: 'none' }
  | { status: 'pending'; expiresAt: string }
  | { status: 'approved'; markerAllowed: boolean; requestId: string }
  | { status: 'denied' }
  | { status: 'expired' };

/**
 * The state of the CURRENT login session's newest request. A pending request past its expiry is
 * marked expired here. For an approved request, `markerAllowed` is true only for the one call that
 * claims it (one-shot), and only when the request was made for this same session.
 */
export async function getWhatsAppApprovalStatus(
  ctx: { userId: string; sessionId: string | null },
  deps: TwoFactorWhatsAppDeps
): Promise<WhatsAppApprovalStatusResult> {
  if (!ctx.sessionId) return { status: 'none' };
  const { repository } = deps;
  const request = await repository.findLatestForSession(ctx.userId, ctx.sessionId);
  if (!request || request.profileId !== ctx.userId || request.sessionId !== ctx.sessionId) return { status: 'none' };
  const now = clock(deps);

  switch (request.status) {
    case 'pending': {
      if (!isExpired(request, now)) return { status: 'pending', expiresAt: request.expiresAt };
      if (await repository.decide(request.id, 'expired', null, now)) {
        await repository.logEvent(request.profileId, 'whatsapp_approval_expired', null, { request_id: request.id });
      }
      return { status: 'expired' };
    }
    case 'approved': {
      const claimed = request.markerIssuedAt === null && (await repository.claimMarker(request.id, now));
      return { status: 'approved', markerAllowed: claimed, requestId: request.id };
    }
    case 'denied':
      return { status: 'denied' };
    default:
      return { status: 'expired' };
  }
}
