import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKFLOW = resolve(process.cwd(), '.github/workflows/backup-cron-invoices.yml');

function readWorkflow(path = WORKFLOW): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

/** Lines that are not YAML comments. */
function codeLines(text: string): string[] {
  return text.split('\n').filter((line) => !/^\s*#/.test(line));
}

function isHeld(text: string): boolean {
  return /^# STATUS: HELD\b/m.test(text);
}

function hasLiveSchedule(text: string): boolean {
  return codeLines(text).some((line) => /^\s*schedule:/.test(line));
}

/** Text of every `run:` step body (inline or block). */
function runBodies(text: string): string[] {
  const lines = text.split('\n');
  const bodies: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*#/.test(lines[i])) continue;
    const match = /^(\s*)(?:- )?run:\s*(.*)$/.exec(lines[i]);
    if (!match) continue;
    const indent = match[1].length;
    let body = match[2];
    for (let j = i + 1; j < lines.length; j++) {
      const lead = /^(\s*)\S/.exec(lines[j]);
      if (lead && lead[1].length <= indent) break;
      body += `\n${lines[j]}`;
    }
    bodies.push(body);
  }
  return bodies;
}

describe('backup cron workflow guard (#623)', () => {
  const text = readWorkflow();

  it('is self-consistent: a HELD workflow has no live schedule', () => {
    expect(isHeld(text) && hasLiveSchedule(text)).toBe(false);
  });

  it('is self-consistent: an ACTIVE workflow has a live schedule', () => {
    expect(/^# STATUS: ACTIVE\b/m.test(text) && !hasLiveSchedule(text)).toBe(false);
  });

  it('runs daily at 07:00 UTC when active', () => {
    if (!/^# STATUS: ACTIVE\b/m.test(text)) return;
    expect(codeLines(text).join('\n')).toMatch(/^\s+- cron: '0 7 \* \* \*'$/m);
    expect(codeLines(text).filter((line) => /^\s+- cron:/.test(line))).toHaveLength(1);
  });

  it('guard helpers detect HELD with a live schedule', () => {
    const bad = '# STATUS: HELD until ready\non:\n  schedule:\n    - cron: "0 7 * * *"\n';
    const ok = '# STATUS: HELD until ready\non:\n  # schedule:\n  workflow_dispatch:\n';
    expect(isHeld(bad) && hasLiveSchedule(bad)).toBe(true);
    expect(isHeld(ok) && hasLiveSchedule(ok)).toBe(false);
  });

  it('declares a STATUS marker', () => {
    expect(/^# STATUS: (HELD|ACTIVE)\b/m.test(text)).toBe(true);
  });

  it('runs the preflight before any curl call', () => {
    const code = codeLines(text).join('\n');
    const preflight = code.indexOf('scripts/backup-cron-preflight.mjs');
    const curl = code.indexOf('curl ');
    expect(preflight).toBeGreaterThan(-1);
    expect(curl).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(curl);
  });

  it('gates the curl steps on the preflight result', () => {
    const code = codeLines(text).join('\n');
    expect(code).toMatch(/id: health-check\n\s+if: steps\.preflight\.outputs\.ok == 'true'/);
    expect(code).toMatch(/if: steps\.preflight\.outputs\.ok == 'true' && steps\.health-check/);
  });

  it('covers both the stage and production environments', () => {
    const code = codeLines(text).join('\n');
    expect(code).toMatch(/environment: \$\{\{ matrix\.environment \}\}/);
    expect(code).toMatch(/environment: \[stage, production\]/);
    expect(code).toMatch(/fail-fast: false/);
  });

  it('never interpolates secrets into run: text', () => {
    const bodies = runBodies(text);
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) expect(body).not.toMatch(/secrets\./);
  });

  it('lets a failed preflight (the alert) fail the job visibly', () => {
    const code = codeLines(text).join('\n');
    expect(code).not.toMatch(/continue-on-error/);
    expect(code).not.toMatch(/\|\|\s*true/);
  });

  it('never interpolates any expression into run: text', () => {
    for (const body of runBodies(text)) expect(body).not.toContain('${{');
  });

  it('passes APP_URL and CRON_SECRET from the environment to the steps', () => {
    const code = codeLines(text).join('\n');
    expect(code).toMatch(/^\s+APP_URL: \$\{\{ secrets\.APP_URL \}\}$/m);
    expect(code).toMatch(/^\s+CRON_SECRET: \$\{\{ secrets\.CRON_SECRET \}\}$/m);
  });

  it('is triggered only by schedule and manual dispatch', () => {
    const code = codeLines(text).join('\n');
    expect(code).toMatch(/^on:\n(\s+workflow_dispatch:\n|\s+schedule:\n)/m);
    expect(code).not.toMatch(/^\s+(push|pull_request|pull_request_target|workflow_run):/m);
  });

  it('grants the token read-only contents access', () => {
    const code = codeLines(text).join('\n');
    expect(code).toMatch(/^permissions:\n\s+contents: read$/m);
  });
});
