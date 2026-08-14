import { normalizePhoneNumber } from '@/lib/sms/termii';

export type WhatsAppOptInImportRow = {
  residentCode: string;
  phoneNumber: string;
};

export type WhatsAppOptInImportParseResult = {
  rows: WhatsAppOptInImportRow[];
  errors: Array<{ line: number; error: string }>;
};

export function parseWhatsAppOptInImport(input: string): WhatsAppOptInImportParseResult {
  const rows: WhatsAppOptInImportRow[] = [];
  const errors: Array<{ line: number; error: string }> = [];
  const seen = new Set<string>();
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (index === 0 && /^resident[_ ]?code\s*[,;]\s*phone(?:[_ ]?number)?$/i.test(line)) return;
    const [residentCode, rawPhone] = line.split(/[,;]/).map((part) => part.trim());
    if (!residentCode || !rawPhone) {
      errors.push({ line: lineNumber, error: 'Expected resident_code,phone_number' });
      return;
    }
    let phoneNumber: string;
    try {
      phoneNumber = normalizePhoneNumber(rawPhone);
    } catch {
      errors.push({ line: lineNumber, error: 'Invalid phone number' });
      return;
    }
    if (phoneNumber.length < 10) {
      errors.push({ line: lineNumber, error: 'Invalid phone number' });
      return;
    }
    const key = `${residentCode.toUpperCase()}:${phoneNumber}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ residentCode, phoneNumber });
  });

  return { rows, errors };
}
