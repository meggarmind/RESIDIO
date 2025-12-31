import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import { format } from 'date-fns';
import type { InvoiceWithDetails } from '@/types/database';

// Styles for PDF
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1a1a1a',
  },
  // Header
  header: {
    borderBottomWidth: 2,
    borderBottomColor: '#1a1a1a',
    paddingBottom: 15,
    marginBottom: 20,
  },
  estateName: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  documentTitle: {
    fontSize: 12,
    textAlign: 'center',
    color: '#666666',
    marginTop: 4,
  },
  // Receipt info row
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  infoBlock: {
    width: '48%',
  },
  infoLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#666666',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  // Status badge
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  statusPaid: {
    backgroundColor: '#dcfce7',
  },
  statusUnpaid: {
    backgroundColor: '#fef3c7',
  },
  statusText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
  },
  statusTextPaid: {
    color: '#166534',
  },
  statusTextUnpaid: {
    color: '#92400e',
  },
  // Section
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#666666',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  // Bill To box
  billToBox: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 4,
  },
  billToName: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  billToDetail: {
    fontSize: 10,
    color: '#666666',
    marginBottom: 2,
  },
  // Table
  table: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tableHeaderCell: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#666666',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  tableCell: {
    fontSize: 10,
  },
  descriptionCol: {
    width: '70%',
  },
  amountCol: {
    width: '30%',
    textAlign: 'right',
  },
  // Totals
  totalsSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  totalLabel: {
    fontSize: 10,
    width: 100,
    textAlign: 'right',
    paddingRight: 15,
  },
  totalValue: {
    fontSize: 10,
    width: 100,
    textAlign: 'right',
  },
  totalRowGrand: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  totalLabelGrand: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
  },
  totalValueGrand: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
  },
  // Payment confirmation
  paymentConfirmation: {
    backgroundColor: '#dcfce7',
    padding: 12,
    borderRadius: 4,
    marginTop: 20,
  },
  paymentConfirmationTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#166534',
    marginBottom: 4,
  },
  paymentConfirmationText: {
    fontSize: 10,
    color: '#166534',
  },
  // Footer
  footer: {
    borderTopWidth: 2,
    borderTopColor: '#1a1a1a',
    paddingTop: 15,
    marginTop: 'auto',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 8,
    color: '#999999',
  },
});

// Format currency helper (inline to avoid importing client code)
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

interface InvoiceReceiptPDFProps {
  invoice: InvoiceWithDetails;
  estateName?: string;
}

/**
 * PDF Invoice Receipt Component
 *
 * Generates a downloadable PDF receipt for paid invoices.
 * Uses @react-pdf/renderer for server-side PDF generation.
 */
export function InvoiceReceiptPDF({ invoice, estateName = 'Residio Estate' }: InvoiceReceiptPDFProps) {
  const isPaid = invoice.status === 'paid';
  const receiptNumber = `RCP-${invoice.invoice_number?.replace('INV-', '') || invoice.id.slice(0, 8).toUpperCase()}`;
  const amountDue = invoice.amount_due || 0;
  const amountPaid = invoice.amount_paid || 0;
  const remaining = amountDue - amountPaid;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.estateName}>{estateName}</Text>
          <Text style={styles.documentTitle}>
            {isPaid ? 'Payment Receipt' : 'Invoice'}
          </Text>
        </View>

        {/* Receipt Info */}
        <View style={styles.infoRow}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Receipt No:</Text>
            <Text style={styles.infoValue}>{receiptNumber}</Text>
          </View>
          <View style={[styles.infoBlock, { alignItems: 'flex-end' }]}>
            <Text style={styles.infoLabel}>Date:</Text>
            <Text style={styles.infoValue}>
              {invoice.created_at ? format(new Date(invoice.created_at), 'MMMM d, yyyy') : 'N/A'}
            </Text>
          </View>
        </View>

        {/* Status Badge */}
        <View style={[
          styles.statusBadge,
          isPaid ? styles.statusPaid : styles.statusUnpaid,
          { marginBottom: 20 }
        ]}>
          <Text style={[
            styles.statusText,
            isPaid ? styles.statusTextPaid : styles.statusTextUnpaid
          ]}>
            {isPaid ? 'PAID' : invoice.status?.toUpperCase() || 'UNPAID'}
          </Text>
        </View>

        {/* Bill To */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bill To</Text>
          <View style={styles.billToBox}>
            <Text style={styles.billToName}>
              {invoice.resident?.first_name} {invoice.resident?.last_name}
            </Text>
            <Text style={styles.billToDetail}>
              Resident Code: {invoice.resident?.resident_code}
            </Text>
            {invoice.house && (
              <Text style={styles.billToDetail}>
                Property: {invoice.house.short_name || invoice.house.house_number}
                {invoice.house.street?.name && ` • ${invoice.house.house_number} ${invoice.house.street.name}`}
              </Text>
            )}
            {invoice.resident?.email && (
              <Text style={styles.billToDetail}>
                Email: {invoice.resident.email}
              </Text>
            )}
          </View>
        </View>

        {/* Invoice Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invoice Details</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={styles.billToDetail}>
              Invoice Number: {invoice.invoice_number}
            </Text>
            <Text style={styles.billToDetail}>
              Billing Profile: {invoice.billing_profile?.name || 'N/A'}
            </Text>
          </View>
          {invoice.due_date && (
            <Text style={styles.billToDetail}>
              Due Date: {format(new Date(invoice.due_date), 'MMMM d, yyyy')}
            </Text>
          )}
        </View>

        {/* Line Items Table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items</Text>
          <View style={styles.table}>
            {/* Table Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, styles.descriptionCol]}>Description</Text>
              <Text style={[styles.tableHeaderCell, styles.amountCol]}>Amount</Text>
            </View>

            {/* Table Rows */}
            {invoice.invoice_items && invoice.invoice_items.length > 0 ? (
              invoice.invoice_items.map((item, index) => (
                <View
                  key={item.id}
                  style={
                    index === invoice.invoice_items!.length - 1
                      ? [styles.tableRow, styles.tableRowLast]
                      : styles.tableRow
                  }
                >
                  <Text style={[styles.tableCell, styles.descriptionCol]}>
                    {item.description}
                  </Text>
                  <Text style={[styles.tableCell, styles.amountCol]}>
                    {formatCurrency(item.amount || 0)}
                  </Text>
                </View>
              ))
            ) : (
              <View style={[styles.tableRow, styles.tableRowLast]}>
                <Text style={[styles.tableCell, styles.descriptionCol]}>
                  {invoice.billing_profile?.name || 'Service charge'}
                </Text>
                <Text style={[styles.tableCell, styles.amountCol]}>
                  {formatCurrency(amountDue)}
                </Text>
              </View>
            )}
          </View>

          {/* Totals */}
          <View style={styles.totalsSection}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal:</Text>
              <Text style={styles.totalValue}>{formatCurrency(amountDue)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Amount Paid:</Text>
              <Text style={[styles.totalValue, { color: '#166534' }]}>
                {formatCurrency(amountPaid)}
              </Text>
            </View>
            {remaining > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Balance Due:</Text>
                <Text style={[styles.totalValue, { color: '#dc2626' }]}>
                  {formatCurrency(remaining)}
                </Text>
              </View>
            )}
            <View style={[styles.totalRow, styles.totalRowGrand]}>
              <Text style={[styles.totalLabel, styles.totalLabelGrand]}>
                {isPaid ? 'Total Paid:' : 'Total Due:'}
              </Text>
              <Text style={[styles.totalValue, styles.totalValueGrand]}>
                {formatCurrency(isPaid ? amountPaid : amountDue)}
              </Text>
            </View>
          </View>
        </View>

        {/* Payment Confirmation (for paid invoices) */}
        {isPaid && (
          <View style={styles.paymentConfirmation}>
            <Text style={styles.paymentConfirmationTitle}>Payment Confirmed</Text>
            <Text style={styles.paymentConfirmationText}>
              This invoice has been fully paid. Thank you for your payment.
            </Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>
              Generated: {format(new Date(), 'MMM d, yyyy HH:mm')}
            </Text>
            <Text style={styles.footerText}>
              Thank you for your payment
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
