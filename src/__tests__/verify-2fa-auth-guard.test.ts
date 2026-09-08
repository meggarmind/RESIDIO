import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('/auth/verify-2fa authentication guard', () => {
  it('redirects an unauthenticated request on the server before rendering the client form', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/auth/verify-2fa/page.tsx'),
      'utf8'
    );

    expect(source).not.toMatch(/^['"]use client['"];?/);
    expect(source).toContain('await createServerSupabaseClient()');
    expect(source).toContain('await supabase.auth.getUser()');
    expect(source).toContain("redirect('/login')");
    expect(source).toContain('<Verify2FAForm />');
  });
});
