import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { formatPdfCurrency } from '@/lib/pdf/format-currency';
import { formatPdfDate } from '@/lib/pdf/format-date';

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a' },
  header: { borderBottomWidth: 2, borderBottomColor: '#1a1a1a', paddingBottom: 15, marginBottom: 20 },
  estateName: { fontSize: 20, fontFamily: 'Helvetica-Bold', textAlign: 'center', letterSpacing: 1, textTransform: 'uppercase' },
  documentTitle: { fontSize: 12, textAlign: 'center', color: '#666666', marginTop: 4 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#666666', textTransform: 'uppercase', marginBottom: 8 },
  box: { backgroundColor: '#f5f5f5', padding: 12, borderRadius: 4 },
  name: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  detail: { fontSize: 10, color: '#666666', marginBottom: 2 },
  table: { borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 4 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e5e5', paddingVertical: 8, paddingHorizontal: 10 },
  rowLast: { borderBottomWidth: 0 },
  label: { width: '35%', color: '#666666' },
  value: { width: '65%', textAlign: 'right' },
  confirmation: { backgroundColor: '#dcfce7', padding: 12, borderRadius: 4, marginTop: 10 },
  confirmationText: { fontSize: 10, color: '#166534', fontFamily: 'Helvetica-Bold' },
  footer: { borderTopWidth: 2, borderTopColor: '#1a1a1a', paddingTop: 15, marginTop: 'auto' },
  footerText: { fontSize: 8, color: '#999999' },
});

export interface PaymentReceiptData {
  receiptNumber: string;
  residentName: string;
  residentCode: string;
  propertyLabel: string;
  /** NGN, as stored. */
  amount: number;
  paymentDate: string;
  method: string | null;
  reference: string | null;
  verifiedAt: string | null;
}

/**
 * A receipt for one verified payment (#816 decision 14). The invoice receipt describes an invoice; a
 * payment is credited to the wallet and is not tied to a single invoice, so this one describes the
 * payment itself.
 */
export function PaymentReceiptPDF({ receipt, estateName = 'Residio Estate' }: { receipt: PaymentReceiptData; estateName?: string }) {
  const rows: Array<[string, string]> = [
    ['Receipt number', receipt.receiptNumber],
    ['Payment date', formatPdfDate(receipt.paymentDate)],
    ['Amount', formatPdfCurrency(receipt.amount)],
    ['Method', receipt.method ? receipt.method.replaceAll('_', ' ') : 'Payment'],
    ...(receipt.reference ? ([['Reference', receipt.reference]] as Array<[string, string]>) : []),
    ...(receipt.verifiedAt ? ([['Verified on', formatPdfDate(receipt.verifiedAt)]] as Array<[string, string]>) : []),
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.estateName}>{estateName}</Text>
          <Text style={styles.documentTitle}>Payment Receipt</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Received from</Text>
          <View style={styles.box}>
            <Text style={styles.name}>{receipt.residentName}</Text>
            <Text style={styles.detail}>CODE: {receipt.residentCode}</Text>
            <Text style={styles.detail}>{receipt.propertyLabel}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment details</Text>
          <View style={styles.table}>
            {rows.map(([label, value], index) => (
              <View key={label} style={index === rows.length - 1 ? [styles.row, styles.rowLast] : styles.row}>
                <Text style={styles.label}>{label}</Text>
                <Text style={styles.value}>{value}</Text>
              </View>
            ))}
          </View>
          <View style={styles.confirmation}>
            <Text style={styles.confirmationText}>This payment has been verified by the estate office.</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { fontFamily: 'Helvetica-Bold', marginBottom: 2 }]}>{estateName}</Text>
          <Text style={styles.footerText}>Powered by Residio</Text>
        </View>
      </Page>
    </Document>
  );
}
