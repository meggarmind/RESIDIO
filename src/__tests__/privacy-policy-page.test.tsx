import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const settings = vi.hoisted(() => ({ result: { status: 'ok', values: new Map<string, unknown>() } as { status: string; values: Map<string, unknown>; message?: string } }));
vi.mock('@/lib/settings/service', () => ({ getRawSettingsAsService: vi.fn(async () => settings.result) }));

import PrivacyPolicyPage from '@/app/privacy-policy/page';

async function render(values: Record<string, unknown>) {
  settings.result = { status: 'ok', values: new Map(Object.entries(values)) };
  return renderToStaticMarkup(await PrivacyPolicyPage());
}

describe('privacy policy page', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));

  it('shows the estate name, the 90 day survey retention and the contact line', async () => {
    const html = await render({ estate_name: 'Palm Estate', estate_phone: '0801', estate_email: 'office@palm.test' });
    expect(html).toContain('Palm Estate');
    expect(html).toContain('Survey answers: 90 days.');
    expect(html).toContain('0801 or at office@palm.test');
  });

  it('omits the contact details when none are set', async () => {
    const html = await render({ estate_name: 'Palm Estate' });
    expect(html).not.toContain('You can contact the estate office');
    expect(html).toContain('Contact the estate office to use any of your rights');
  });

  it('still renders with the default estate name when settings fail', async () => {
    settings.result = { status: 'error', values: new Map(), message: 'down' };
    expect(renderToStaticMarkup(await PrivacyPolicyPage())).toContain('Residio Estate');
  });
});
