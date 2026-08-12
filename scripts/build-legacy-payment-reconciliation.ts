/**
 * Builds a non-writing, house/year payment comparison from the reviewed
 * legacy ledger and the cloud snapshot.  It deliberately does not propose
 * inserts: a row can include development, power, or security charges that
 * require human allocation before any payment write.
 */
import fs from 'node:fs';
import path from 'node:path';

type Snapshot = {
  payments: Array<{ house_id: string; amount: number | string; payment_date: string; status: string }>;
};
type Report = {
  house_matches: Array<{
    id: string;
    street: string;
    reconciled_house_label: string;
    status: string;
    candidates: Array<{ id: string; house_number: string }>;
  }>;
};

const root = process.cwd();
const ledger = fs.readFileSync(path.join(root, 'docs/importdata/legacy-record-ledger.md'), 'utf8');
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'docs/importdata/db-reconciliation-snapshot.json'), 'utf8')) as Snapshot;
const report = JSON.parse(fs.readFileSync(path.join(root, 'docs/importdata/house-reconciliation-report.json'), 'utf8')) as Report;

const amount = (value: string) => {
  const match = value.replace(/,/g, '').match(/(?:NGN|₦|N)\s*\(?([0-9]+(?:\.[0-9]+)?)/i);
  return match ? Number(match[1]) : null;
};
const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;

const matches = new Map(report.house_matches.map((match) => [match.id, match]));
const paidByHouseYear = new Map<string, number>();
for (const payment of snapshot.payments) {
  if (!payment.payment_date || payment.status === 'voided') continue;
  const year = payment.payment_date.slice(0, 4);
  if (!/^\d{4}$/.test(year)) continue;
  const key = `${payment.house_id}:${year}`;
  paidByHouseYear.set(key, (paidByHouseYear.get(key) ?? 0) + Number(payment.amount));
}

const blocks = [...ledger.matchAll(/^## (L-\d+) — ([A-Z.]+) \/ House (.+)$/gm)];
const rows: Array<Record<string, unknown>> = [];
for (let index = 0; index < blocks.length; index += 1) {
  const block = blocks[index];
  const body = ledger.slice(block.index!, index + 1 < blocks.length ? blocks[index + 1].index : ledger.length);
  const match = matches.get(block[1]);
  const house = match?.status === 'matched' ? match.candidates[0] : null;
  for (const line of body.split(/\r?\n/)) {
    if (!/^\|\s*20\d{2}\s*\|/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    const legacyPaid = amount(cells[3] ?? '');
    if (legacyPaid === null || !house) continue;
    const year = cells[0];
    const databasePaid = paidByHouseYear.get(`${house.id}:${year}`) ?? 0;
    rows.push({
      ledger_id: block[1], street: block[2], legacy_house: match?.reconciled_house_label ?? block[3].trim(),
      year, legacy_paid_ngn: legacyPaid, database_paid_ngn: databasePaid,
      difference_ngn: legacyPaid - databasePaid,
      status: legacyPaid === databasePaid ? 'matched' : 'requires_payment_level_review',
      safety_note: 'No import action proposed. Compare dated source cells and payment provenance before creating any payment record.',
    });
  }
}

const output = {
  generated_at: new Date().toISOString(),
  mode: 'read_only',
  methodology: 'Compares per-house, per-calendar-year paid totals only. It excludes voided database payments and does not allocate development/security/connection charges.',
  summary: {
    comparable_rows: rows.length,
    matched_rows: rows.filter((row) => row.status === 'matched').length,
    review_rows: rows.filter((row) => row.status !== 'matched').length,
  },
  rows,
};
const jsonPath = path.join(root, 'docs/importdata/legacy-payment-reconciliation.json');
const csvPath = path.join(root, 'docs/importdata/legacy-payment-reconciliation.csv');
fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2) + '\n');
const header = ['ledger_id','street','legacy_house','year','legacy_paid_ngn','database_paid_ngn','difference_ngn','status','safety_note'];
fs.writeFileSync(csvPath, [header.join(','), ...rows.map((row) => header.map((key) => quote(row[key])).join(','))].join('\n') + '\n');
console.log(JSON.stringify({ json: path.relative(root, jsonPath), csv: path.relative(root, csvPath), ...output.summary }));
