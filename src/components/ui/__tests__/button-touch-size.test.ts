// Issue #750: icon-only buttons are 44px square on phones (below the md breakpoint).
// Static source check: reads button.tsx as text, no rendering, no network.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(process.cwd(), 'src', 'components', 'ui', 'button.tsx'), 'utf8');

function sizeClasses(name: string): string | undefined {
  const match = SOURCE.match(new RegExp(`(?:^|\\n)\\s*"?${name}"?:\\s*"([^"]*)"`));
  return match?.[1];
}

describe('Button icon sizes on phones (#750)', () => {
  it.each(['icon', 'icon-sm', 'icon-lg'])('%s grows to 44px below md', (name) => {
    const classes = sizeClasses(name);
    expect(classes, `size "${name}" must exist in button.tsx`).toBeDefined();
    expect(classes, `size "${name}" must carry max-md:size-11 (44px)`).toContain('max-md:size-11');
  });

  it('keeps the desktop sizes', () => {
    expect(sizeClasses('icon')).toMatch(/^size-9\b/);
    expect(sizeClasses('icon-sm')).toMatch(/^size-8\b/);
    expect(sizeClasses('icon-lg')).toMatch(/^size-10\b/);
  });

  it('leaves the extra-large icon size alone (already 48px)', () => {
    expect(sizeClasses('icon-xl')).toBe('size-12');
  });
});
