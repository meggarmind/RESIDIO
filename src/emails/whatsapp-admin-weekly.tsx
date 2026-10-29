import { Heading, Section, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

export interface WhatsAppAdminWeeklyRow {
  /** `dd mmm yyyy`, Africa/Lagos. */
  date: string;
  admin: string;
  item: string;
  target: string;
  outcome: string;
}

interface WhatsAppAdminWeeklyEmailProps {
  firstName: string;
  /** `22 Oct 2026 to 28 Oct 2026`. */
  periodLabel: string;
  rows: WhatsAppAdminWeeklyRow[];
  /** Rows left out of the table because the week had more than the email shows. */
  omitted: number;
  estateName: string;
  estateEmail?: string;
  estatePhone?: string;
  estateAddress?: string;
  estateLogoUrl?: string;
  estateWebsite?: string;
}

export function whatsAppAdminWeeklySubject(periodLabel: string): string {
  return `WhatsApp admin actions: ${periodLabel}`;
}

export function WhatsAppAdminWeeklyEmail({ firstName, periodLabel, rows, omitted, estateName, estateEmail, estatePhone, estateAddress, estateWebsite, estateLogoUrl }: WhatsAppAdminWeeklyEmailProps) {
  return (
    <EmailLayout preview={`WhatsApp admin actions, ${periodLabel}`} estateName={estateName} estateEmail={estateEmail} estatePhone={estatePhone} estateAddress={estateAddress} estateWebsite={estateWebsite} estateLogoUrl={estateLogoUrl}>
      <Heading style={heading}>WhatsApp admin actions this week</Heading>
      <Text style={paragraph}>Hi {firstName},</Text>
      <Text style={paragraph}>This is every admin action done on WhatsApp from {periodLabel}.</Text>
      {rows.length === 0 ? (
        <Text style={paragraph}>No admin actions this week.</Text>
      ) : (
        <Section>
          <table style={table} cellPadding={0} cellSpacing={0}>
            <thead>
              <tr>
                {['Date', 'Admin', 'Item', 'House or resident', 'Outcome'].map((title) => (
                  <th key={title} style={th}>{title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  <td style={td}>{row.date}</td>
                  <td style={td}>{row.admin}</td>
                  <td style={td}>{row.item}</td>
                  <td style={td}>{row.target}</td>
                  <td style={td}>{row.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {omitted > 0 && <Text style={paragraph}>{omitted} more actions are not shown. See the WhatsApp operations console for the full list.</Text>}
        </Section>
      )}
    </EmailLayout>
  );
}

const heading = { color: '#1a1a2e', fontSize: '22px', fontWeight: 'bold' as const, margin: '0 0 24px', padding: 0 };
const paragraph = { color: '#555555', fontSize: '15px', lineHeight: '26px', margin: '0 0 16px' };
const table = { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' };
const th = { textAlign: 'left' as const, padding: '6px 8px', borderBottom: '2px solid #e5e7eb', color: '#1a1a2e' };
const td = { padding: '6px 8px', borderBottom: '1px solid #e5e7eb', color: '#555555', verticalAlign: 'top' as const };

export default WhatsAppAdminWeeklyEmail;
