import { Document, Page, Text, View } from '@react-pdf/renderer';
import { reportPdfStyles as s } from '@/lib/pdf/reports/base-styles';

export interface DebtStatusPdfRow {
  street: string;
  house: string;
  /** The editable status label. No amounts: the report is status only (#982). */
  status: string;
}

export interface DebtStatusPdfData {
  estateName: string;
  /** `31 August 2026`. */
  generatedOn: string;
  scopeLabel: string;
  footnote: string;
  rows: DebtStatusPdfRow[];
}

/** One section per street, one line per house: house code and debt status. */
export function DebtStatusPdf({ data }: { data: DebtStatusPdfData }) {
  const streets = [...new Set(data.rows.map((row) => row.street))];
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.headerRow}>
            <View>
              <Text style={s.headerTitle}>Debt Status</Text>
              <Text style={s.headerSubtitle}>{data.scopeLabel}</Text>
            </View>
            <View style={s.headerRight}>
              <Text style={s.headerRightTitle}>{data.estateName}</Text>
              <Text style={s.headerRightDate}>{data.generatedOn}</Text>
            </View>
          </View>
        </View>

        {streets.map((street) => (
          <View key={street} style={s.section}>
            <Text style={s.sectionTitle} minPresenceAhead={60}>{street}</Text>
            <View style={s.table}>
              <View style={s.tableHeader} minPresenceAhead={24}>
                <Text style={[s.tableHeaderCell, { flex: 2 }]}>House</Text>
                <Text style={[s.tableHeaderCell, { flex: 2 }]}>Debt status</Text>
              </View>
              {data.rows
                .filter((row) => row.street === street)
                .map((row, i) => (
                  <View key={row.house} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                    <Text style={[s.tableCell, { flex: 2 }]}>{row.house}</Text>
                    <Text style={[s.tableCell, { flex: 2 }]}>{row.status}</Text>
                  </View>
                ))}
            </View>
          </View>
        ))}

        <Text style={s.footer} fixed>{data.footnote}</Text>
      </Page>
    </Document>
  );
}
