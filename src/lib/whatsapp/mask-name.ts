/**
 * Names on the debt status report are masked (owner decision 29 Oct 2026, #1294): each word keeps its
 * first 2 letters and gets `***`, so an admin can recognise the resident and a third party cannot.
 * Titles and organisation words stay whole, so `TIM AKENROYE (PASTOR)` reads `TI*** AK*** (PASTOR)`.
 */
const KEPT_WORDS = new Set([
  // Titles
  'MR', 'MRS', 'MS', 'MISS', 'DR', 'CHIEF', 'PASTOR', 'BARR', 'ENGR', 'PROF', 'APOSTLE', 'REV', 'ALHAJI', 'ALHAJA', 'HRH', 'SIR', 'LADY', 'ARC', 'HON',
  // Organisation words
  'LTD', 'LIMITED', 'PLC', 'NIG', 'NIGERIA', 'CO', 'COMPANY', 'ENTERPRISES', 'VENTURES', 'GLOBAL', 'INTERNATIONAL', 'GROUP', 'HOLDINGS',
  'PROPERTIES', 'CHURCH', 'MINISTRY', 'MINISTRIES', 'MOSQUE', 'PHARMACY', 'SCHOOL', 'HOTEL', 'ESTATE', 'LANDLORD', 'TENANT',
]);

function maskWord(word: string): string {
  const letters = word.replace(/[^\p{L}\p{N}]/gu, '');
  if (letters.length <= 2 || KEPT_WORDS.has(letters.toUpperCase())) return word;
  const start = word.search(/[\p{L}\p{N}]/u);
  const end = word.length - [...word].reverse().join('').search(/[\p{L}\p{N}]/u);
  return `${word.slice(0, start)}${letters.slice(0, 2)}***${word.slice(end)}`;
}

export function maskName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/).filter(Boolean).map(maskWord).join(' ');
}
