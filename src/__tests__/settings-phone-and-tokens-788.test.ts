// Issue #788: settings controls keep a 44px phone hit area and colours come from
// semantic tokens. Static source check: reads the files as text, no rendering.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const S = 'src/app/(dashboard)/settings';

const FILES = [
  `${S}/billing/page.tsx`,
  `${S}/billing/development-levies/page.tsx`,
  `${S}/billing/invoices/page.tsx`,
  `${S}/billing/late-fees/page.tsx`,
  `${S}/billing/profiles/page.tsx`,
  `${S}/branding/page.tsx`,
  `${S}/data-retention/page.tsx`,
  `${S}/document-categories/page.tsx`,
  `${S}/message-templates/page.tsx`,
  `${S}/email/page.tsx`,
  `${S}/email-integration/page.tsx`,
  `${S}/maintenance/page.tsx`,
  `${S}/notifications/page.tsx`,
  `${S}/notifications/reminders/schedule/page.tsx`,
  `${S}/security/categories/page.tsx`,
  'src/components/admin/streets-list.tsx',
  'src/components/admin/house-types-list.tsx',
  'src/components/admin/bank-accounts-list.tsx',
  'src/components/admin/roles-list.tsx',
  'src/components/admin/bank-passwords-section.tsx',
  'src/components/notifications/schedule-list.tsx',
  'src/components/notifications/template-list.tsx',
];

// transaction-tags-list is left out of the colour rule: its palette is the tag colour a user picks.
const TAG_LIST = 'src/components/admin/transaction-tags-list.tsx';

const RAW_COLOUR = /\b(bg|text|border)-(green|red|amber|blue|gray|emerald|yellow|orange|purple)-\d{2,3}\b/;
// A 32px control with no phone size; icon glyphs (`<Icon className="h-8 w-8"`) are not controls.
const SMALL_TARGET = /\bh-8 w-8\b/;

function offences(files: string[], pattern: RegExp, skip?: RegExp): string[] {
  return files.flatMap((file) =>
    readFileSync(join(process.cwd(), file), 'utf8')
      .split(/\r?\n/)
      .flatMap((line, i) => (pattern.test(line) && !skip?.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : []))
  );
}

describe('settings phone targets and tokens (#788)', () => {
  it('icon buttons carry size-11 md:size-8 instead of a bare h-8 w-8', () => {
    const hits = offences([...FILES, TAG_LIST], SMALL_TARGET, /Icon\b/);
    expect(hits, `Use size-11 md:size-8:\n${hits.join('\n')}`).toEqual([]);
  });

  it('uses semantic colour tokens, not raw palette classes', () => {
    const hits = offences(FILES, RAW_COLOUR);
    expect(hits, `Use success / warning / info / destructive tokens:\n${hits.join('\n')}`).toEqual([]);
  });

  it('the shared switch pads its hit area to 44px on phones', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/ui/switch.tsx'), 'utf8');
    expect(src).toMatch(/after:-inset-3 md:after:inset-0/);
  });
});
