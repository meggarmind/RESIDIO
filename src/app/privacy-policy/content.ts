export const POLICY_LAST_UPDATED = '21 October 2026';

export interface PolicySection {
  heading: string;
  paragraphs?: string[];
  items?: string[];
}

export interface PolicyContext {
  estateName: string;
  phone?: string;
  email?: string;
}

/** The estate office contact sentence, or '' when neither phone nor email is set. */
export function contactLine({ phone, email }: PolicyContext): string {
  if (phone && email) return `You can contact the estate office on ${phone} or at ${email}.`;
  if (phone) return `You can contact the estate office on ${phone}.`;
  if (email) return `You can contact the estate office at ${email}.`;
  return '';
}

export function buildPolicySections(ctx: PolicyContext): PolicySection[] {
  const { estateName } = ctx;
  const contact = contactLine(ctx);
  return [
    {
      heading: '1. Who we are',
      paragraphs: [
        `${estateName} (the estate) is the data controller for the personal data described here. The estate uses the Residio platform to run estate management: residents and houses, billing, security and communication.`,
      ],
    },
    {
      heading: '2. What we collect',
      items: [
        'Identity and contact: your name, phone number and email address.',
        'Property and occupancy: your house and your role, for example landlord or tenant.',
        'Billing and payments: invoices, levies, payments, payment proofs and your wallet balance.',
        'Security and access: access codes, security contacts and access records.',
        'WhatsApp assistant: your phone number, the messages you send, and your consent and identity-check records.',
        'Survey answers, when you choose to give them.',
      ],
    },
    {
      heading: '3. Why we use it, and our lawful basis',
      paragraphs: [
        'We use personal data under the Nigeria Data Protection Act 2023 (NDPA) and, where it applies, the General Data Protection Regulation (GDPR).',
      ],
      items: [
        'Running the estate and billing: performance of a contract and our legitimate interests.',
        'Security of residents and property: our legitimate interests.',
        'Financial record keeping: a legal obligation.',
        'The WhatsApp assistant: your consent. You can withdraw it at any time.',
      ],
    },
    {
      heading: '4. Who we share it with',
      paragraphs: ['We share personal data only with service providers that process it for us:'],
      items: [
        'Supabase: hosting and database.',
        'Meta (WhatsApp), Chatmaid and Twilio: WhatsApp messaging.',
        'Termii: SMS messages.',
        'Resend: email.',
        'Paystack: online payments.',
        'We do not sell personal data.',
      ],
    },
    {
      heading: '5. International transfers',
      paragraphs: [
        'Our providers may store or process data outside Nigeria. Where this happens, we apply the safeguards that the NDPA requires.',
      ],
    },
    {
      heading: '6. How long we keep it',
      items: [
        'Survey answers: 90 days.',
        'Financial records: as long as the law requires.',
        'Consent records: kept as evidence of your consent.',
        'Other data: while you are a resident, and for a reasonable period after.',
      ],
    },
    {
      heading: '7. Your rights',
      paragraphs: [
        'You have the right to access, correct, delete, restrict or object to our use of your personal data, and to receive it in a portable form. You can withdraw consent at any time. For WhatsApp, decline the notice or contact the estate office. You can also complain to the Nigeria Data Protection Commission (NDPC).',
      ],
    },
    {
      heading: '8. Security',
      paragraphs: [
        'We limit access to personal data to the people who need it, and we protect it with access controls and encrypted connections.',
      ],
    },
    {
      heading: '9. Changes to this policy',
      paragraphs: [
        'We may update this policy. When the WhatsApp privacy notice changes to a new version, the assistant asks residents to accept it again.',
      ],
    },
    {
      heading: '10. Contact',
      paragraphs: [contact || 'Contact the estate office to use any of your rights or to ask a question about this policy.'],
    },
  ];
}
