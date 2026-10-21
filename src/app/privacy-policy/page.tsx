import type { Metadata } from 'next';
import { getRawSettingsAsService } from '@/lib/settings/service';
import { POLICY_LAST_UPDATED, buildPolicySections, type PolicyContext } from './content';

export const metadata: Metadata = { title: 'Privacy Policy' };
// Reads estate settings per request, never at build time.
export const dynamic = 'force-dynamic';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function loadContext(): Promise<PolicyContext> {
  const result = await getRawSettingsAsService(['estate_name', 'estate_phone', 'estate_email']);
  if (result.status === 'error') {
    console.error('Privacy policy: estate settings lookup failed', result.message);
    return { estateName: 'Residio Estate' };
  }
  return {
    estateName: text(result.values.get('estate_name')) || 'Residio Estate',
    phone: text(result.values.get('estate_phone')) || undefined,
    email: text(result.values.get('estate_email')) || undefined,
  };
}

function PrivacyPolicyView({ ctx }: { ctx: PolicyContext }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <article className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
        <p className="text-sm font-medium text-muted-foreground">{ctx.estateName}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {POLICY_LAST_UPDATED}</p>
        {buildPolicySections(ctx).map((section) => (
          <section key={section.heading} className="mt-8">
            <h2 className="text-xl font-semibold">{section.heading}</h2>
            {section.paragraphs?.map((p) => (
              <p key={p} className="mt-2 leading-relaxed">{p}</p>
            ))}
            {section.items ? (
              <ul className="mt-2 list-disc space-y-1 pl-6 leading-relaxed">
                {section.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : null}
          </section>
        ))}
      </article>
    </main>
  );
}

export default async function PrivacyPolicyPage() {
  return <PrivacyPolicyView ctx={await loadContext()} />;
}
