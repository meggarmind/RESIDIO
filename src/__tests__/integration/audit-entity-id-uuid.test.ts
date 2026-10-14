/**
 * Ratchet (#594): no logAudit() call may pass a string literal or template as
 * entityId. audit_logs.entity_id is uuid NOT NULL and
 * logAudit() swallows insert errors, so such a call logs nothing, silently.
 * Pass a real uuid (the row, batch or first affected id) and put the
 * descriptive label in entityDisplay / newValues.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { scanEntityIds } from '@/__tests__/helpers/audit-entity-id-scanner';

/**
 * Deliberate exceptions. To add one, append `'src/actions/x/y.ts::<initializer text>'`
 * (for example `"src/actions/x/y.ts::'batch'"`) with a comment saying why no
 * audit row is needed. Never add an entry to hide a bug: the row is not written.
 */
const ENTITY_ID_ALLOWLIST: readonly string[] = [];

const ROOT = path.resolve(__dirname, '../..');

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      collect(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('audit entityId must be a uuid (#594)', () => {
  it('no logAudit call under src/actions or src/lib passes a literal/template entityId', () => {
    const files = [...collect(path.join(ROOT, 'actions')), ...collect(path.join(ROOT, 'lib'))].filter(
      (f) => path.relative(ROOT, f).replace(/\\/g, '/') !== 'lib/audit/logger.ts'
    );
    const offenders: string[] = [];
    let unverifiable = 0;
    for (const file of files) {
      const rel = 'src/' + path.relative(ROOT, file).replace(/\\/g, '/');
      const scan = scanEntityIds(rel, fs.readFileSync(file, 'utf8'));
      unverifiable += scan.unverifiable;
      for (const f of scan.findings) {
        if (!ENTITY_ID_ALLOWLIST.includes(`${rel}::${f.text}`)) {
          offenders.push(`${rel}:${f.line} entityId: ${f.text}`);
        }
      }
    }
    // Informational: calls built from spreads/variables cannot be checked statically.
    console.info(`audit-entity-id: ${unverifiable} unverifiable logAudit call(s)`);
    expect(offenders).toEqual([]);
  }, 60_000); // parses every action file; slow on a loaded machine
});

describe('scanEntityIds', () => {
  const scan = (body: string) => scanEntityIds('x.ts', `async function f(data: any, id: string){ ${body} }`);

  it('flags a string literal', () => {
    expect(scan(`await logAudit({ action: 'X', entityId: 'batch' });`).findings).toHaveLength(1);
  });
  it('flags a no-substitution template and a template expression', () => {
    expect(scan('await logAudit({ entityId: `batch` });').findings).toHaveLength(1);
    expect(scan('await logAudit({ entityId: `${id}-x` });').findings).toHaveLength(1);
  });
  it('does not judge a fallback expression', () => {
    expect(scan(`await logAudit({ entityId: id || 'manual' });`).findings).toEqual([]);
  });
  it('passes identifier, property access, call and shorthand', () => {
    expect(scan(`await logAudit({ entityId: id });`).findings).toEqual([]);
    expect(scan(`await logAudit({ entityId: data.id });`).findings).toEqual([]);
    expect(scan(`await logAudit({ entityId: crypto.randomUUID() });`).findings).toEqual([]);
    const s = scan(`const entityId = id; await logAudit({ action: 'X', entityId });`);
    expect(s.findings).toEqual([]);
    expect(s.unverifiable).toBe(0);
  });
  it('counts spread-built options as unverifiable without flagging', () => {
    const s = scan(`await logAudit({ ...base }); await logAudit(opts);`);
    expect(s.findings).toEqual([]);
    expect(s.unverifiable).toBe(2);
  });
  it('finds a call nested inside a callback', () => {
    const s = scan(`[1].map(async () => { await logAudit({ entityId: 'ALL' }); });`);
    expect(s.findings).toHaveLength(1);
  });
});
