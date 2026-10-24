import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Pins the release gate workflow (#1136). Regex over a small file: the repo has no YAML parser
 * dependency.
 */
const raw = readFileSync(fileURLToPath(new URL('../../.github/workflows/release-gate.yml', import.meta.url)), 'utf8');
const workflow = raw.replace(/^\s*#.*$/gm, '');

describe('release gate workflow', () => {
  it('runs on pull_request into master for the label-sensitive event types', () => {
    const on = workflow.match(/\non:\n([\s\S]*?)\n\S/)?.[1] ?? '';
    expect(on).toMatch(/^ {2}pull_request:/m);
    expect(on).toMatch(/branches: \[master\]/);
    expect(on).toMatch(/types: \[opened, synchronize, reopened, labeled, unlabeled\]/);
    expect(on).not.toMatch(/push:|workflow_dispatch:/);
  });

  it('applies only when the head ref is stage, in both jobs', () => {
    expect(workflow.match(/\[ "\$HEAD_REF" != "stage" \]/g)).toHaveLength(2);
    expect(workflow.match(/HEAD_REF: \$\{\{ github\.event\.pull_request\.head\.ref \}\}/g)).toHaveLength(2);
  });

  it('check A compares the Stage sha with the PR head sha, with retries', () => {
    expect(workflow).toMatch(/name: Stage runs this commit/);
    expect(workflow).toMatch(/https:\/\/stage\.feyijimi\.ng\/api\/version/);
    expect(workflow).toMatch(/HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
    expect(workflow).toMatch(/seq 1 20/);
    expect(workflow).toMatch(/Stage is not running this commit\. Stage sha: .*PR head sha: \$HEAD_SHA/);
  });

  it('check B requires the uat-dast-passed label', () => {
    expect(workflow).toMatch(/name: UAT and DAST passed/);
    expect(workflow).toMatch(/index\("uat-dast-passed"\)/);
    expect(workflow).toMatch(/UAT and DAST have not been recorded as passed/);
  });

  it('passes untrusted PR values through env, never interpolated into run', () => {
    const runBlocks = workflow.match(/run: \|\n[\s\S]*?(?=\n {2}\S|\n {6}- |$)/g) ?? [];
    expect(runBlocks.length).toBeGreaterThan(0);
    for (const block of runBlocks) expect(block).not.toMatch(/\$\{\{/);
  });

  it('has read-only permissions', () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m);
  });
});
