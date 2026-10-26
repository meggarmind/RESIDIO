/**
 * The satisfaction survey after a successful Assistant request (#872). Asked only after success,
 * at most once every 30 days per resident, a reason on every Poor score, STOP SURVEYS honoured.
 * Wording and parsing only, so client code can import it; the database side is survey-db.ts.
 */

export type SurveyTrigger = 'answer' | 'payment_report' | 'clearance_request';
export type SurveyScore = 'good' | 'okay' | 'poor';
export type SurveyReason = 'too_slow' | 'not_found' | 'wrong_information' | 'other';

export const SURVEY_INTERVAL_DAYS = 30;
export const MAX_SURVEY_COMMENT_LENGTH = 300;

export const surveyPrompt = (assistantName: string) => [`How was ${assistantName} today?`, '1. Good', '2. Okay', '3. Poor'].join('\n');
export const SURVEY_REASON_PROMPT = [
  'Sorry about that. What went wrong?',
  '1. Too slow',
  "2. Couldn't find what I needed",
  '3. Information looked wrong',
  '4. Something else',
].join('\n');
export const SURVEY_COMMENT_PROMPT = 'Anything else you want to tell us? Reply with one line, or SKIP.';
export const SURVEY_THANKS_REPLY = 'Thanks for the feedback.';
export const SURVEY_RECORDED_REPLY = 'Thanks for telling us. The estate office will see your feedback.';
export const SURVEY_OPT_OUT_REPLY = "Done. I won't ask you for feedback again.";

const SCORES = new Map<string, SurveyScore>([['1', 'good'], ['good', 'good'], ['2', 'okay'], ['okay', 'okay'], ['3', 'poor'], ['poor', 'poor']]);
const REASONS = new Map<string, SurveyReason>([['1', 'too_slow'], ['2', 'not_found'], ['3', 'wrong_information'], ['4', 'other']]);
// A thank-you right after an answer; `input` is already lower-cased by normalizeInput.
const THANKS = new Set(['thanks', 'thank you', 'thx', 'ok', 'okay']);
const SKIP = new Set(['skip', 'no', 'none', 'cancel', '0', 'menu']);

export const SURVEY_REASON_LABELS: Record<SurveyReason, string> = {
  too_slow: 'Too slow',
  not_found: "Couldn't find what I needed",
  wrong_information: 'Information looked wrong',
  other: 'Something else',
};
export const SURVEY_SCORE_LABELS: Record<SurveyScore, string> = { good: 'Good', okay: 'Okay', poor: 'Poor' };

export const parseSurveyScore = (input: string): SurveyScore | null => SCORES.get(input) ?? null;
export const parseSurveyReason = (input: string): SurveyReason | null => REASONS.get(input) ?? null;
export const isThanks = (input: string): boolean => THANKS.has(input);

/** STOP SURVEYS must be told apart from STOP, which unsubscribes from alerts. */
export const isSurveyStopCommand = (text: string): boolean => /^STOP\s+SURVEYS?\W*$/i.test(text.trim());

/**
 * The optional free-text line. A skip word, or digits only (a PIN typed by habit, which must not
 * be stored), gives null.
 */
export function cleanSurveyComment(text: string, input: string): string | null {
  const comment = text.trim().slice(0, MAX_SURVEY_COMMENT_LENGTH);
  if (!comment || SKIP.has(input) || /^(?:pin\s*)?\d[\d\s]*$/i.test(comment)) return null;
  return comment;
}
