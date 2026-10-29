import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

export interface DebtStatusPdfRow {
  street: string;
  /** The house number as the estate writes it, for example `11f2`. */
  house: string;
  /** The billed resident's name, masked (#1294). */
  resident: string;
  /** Picks the colour: arrears red, credit green, the others plain. */
  status: 'arrears' | 'outstanding' | 'paid_in_full' | 'credit';
  /** The editable status label. No amounts: the report is status only (#982). */
  label: string;
}

export interface DebtStatusPdfData {
  estateName: string;
  /** `31 August 2026`. */
  generatedOn: string;
  scopeLabel: string;
  /** One line under the title that says what each status means. */
  legend: string;
  footnote: string;
  rows: DebtStatusPdfRow[];
}

const BORDER = '#9ca3af';
const s = StyleSheet.create({
  page: { paddingTop: 32, paddingBottom: 48, paddingHorizontal: 32, fontFamily: 'Helvetica', fontSize: 8.5, color: '#111111' },
  title: { fontSize: 12, fontFamily: 'Helvetica-Bold', borderWidth: 1, borderColor: BORDER, paddingVertical: 4, paddingHorizontal: 4 },
  legend: { fontSize: 7, fontFamily: 'Helvetica-Oblique', borderWidth: 1, borderTopWidth: 0, borderColor: BORDER, paddingVertical: 3, paddingHorizontal: 4 },
  meta: { fontSize: 7, color: '#4b5563', marginTop: 4, marginBottom: 8 },
  headRow: { flexDirection: 'row', backgroundColor: '#000000' },
  headCell: { color: '#ffffff', fontFamily: 'Helvetica-Bold', paddingVertical: 3, paddingHorizontal: 4 },
  row: { flexDirection: 'row', borderLeftWidth: 1, borderBottomWidth: 1, borderColor: BORDER },
  cell: { paddingVertical: 2, paddingHorizontal: 4, borderRightWidth: 1, borderColor: BORDER },
  street: { width: '24%' },
  house: { width: '9%', textAlign: 'center' },
  resident: { width: '49%' },
  status: { width: '18%', textAlign: 'center' },
  arrears: { color: '#dc2626', fontFamily: 'Helvetica-Bold' },
  credit: { color: '#15803d', fontFamily: 'Helvetica-Bold' },
  footer: { position: 'absolute', bottom: 20, left: 32, right: 32, fontSize: 7, color: '#4b5563' },
});

/**
 * The owner's template (29 Oct 2026, #1294): title and legend at the top of every page, then one table
 * with Street, No, Resident and Debt Status; Arrears in red, Credit in green.
 */
export function DebtStatusPdf({ data }: { data: DebtStatusPdfData }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View fixed>
          <Text style={s.title}>Security Dues - Debt Status</Text>
          <Text style={s.legend}>{data.legend}</Text>
          <Text style={s.meta}>{`${data.estateName} · ${data.scopeLabel} · ${data.generatedOn}`}</Text>
          <View style={s.headRow}>
            <Text style={[s.headCell, s.street, { textAlign: 'right' }]}>Street</Text>
            <Text style={[s.headCell, s.house]}>No</Text>
            <Text style={[s.headCell, s.resident, { textAlign: 'right' }]}>Resident</Text>
            <Text style={[s.headCell, s.status]}>Debt Status</Text>
          </View>
        </View>
        {data.rows.map((row, i) => (
          <View key={`${row.street}-${row.house}-${i}`} style={s.row} wrap={false}>
            <Text style={[s.cell, s.street]}>{row.street}</Text>
            <Text style={[s.cell, s.house]}>{row.house}</Text>
            <Text style={[s.cell, s.resident]}>{row.resident}</Text>
            <Text style={[s.cell, s.status, row.status === 'arrears' ? s.arrears : row.status === 'credit' ? s.credit : {}]}>{row.label}</Text>
          </View>
        ))}
        <Text style={s.footer} fixed>{data.footnote}</Text>
      </Page>
    </Document>
  );
}
