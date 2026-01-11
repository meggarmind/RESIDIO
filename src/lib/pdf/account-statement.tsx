import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import { format } from 'date-fns';
import type { AccountStatementData, StatementTransaction } from '@/actions/billing/get-account-statement';

// ============================================================
// Account Statement PDF Styles
// ============================================================

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#1a1a1a',
  },
  // Header Section
  header: {
    borderBottomWidth: 2,
    borderBottomColor: '#1a1a1a',
    paddingBottom: 15,
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  estateName: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  estateSubtitle: {
    fontSize: 9,
    color: '#666666',
    marginTop: 2,
  },
  documentTitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
  },
  statementPeriod: {
    fontSize: 9,
    color: '#666666',
    textAlign: 'right',
    marginTop: 4,
  },
  // Account Info Section
  accountInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 20,
  },
  accountBlock: {
    flex: 1,
  },
  accountBlockRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  sectionTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#666666',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  accountBox: {
    backgroundColor: '#f5f5f5',
    padding: 10,
    borderRadius: 4,
  },
  accountName: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 3,
  },
  accountDetail: {
    fontSize: 9,
    color: '#666666',
    marginBottom: 2,
  },
  // Summary Section
  summarySection: {
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 10,
    borderRadius: 4,
    alignItems: 'center',
  },
  summaryBoxHighlight: {
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#0ea5e9',
  },
  summaryBoxDebt: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  summaryBoxCredit: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#22c55e',
  },
  summaryLabel: {
    fontSize: 8,
    color: '#666666',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  summaryValue: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
  },
  summaryValueDebt: {
    color: '#dc2626',
  },
  summaryValueCredit: {
    color: '#16a34a',
  },
  // Transaction Table
  transactionSection: {
    marginBottom: 20,
  },
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
    paddingHorizontal: 8,
  },
  tableHeaderCell: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#666666',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
    paddingVertical: 6,
    paddingHorizontal: 8,
    minHeight: 24,
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  tableRowAlt: {
    backgroundColor: '#fafafa',
  },
  tableCell: {
    fontSize: 8,
  },
  // Column widths for transaction table
  colDate: { width: '12%' },
  colType: { width: '10%' },
  colDescription: { width: '34%' },
  colDebit: { width: '13%', textAlign: 'right' },
  colCredit: { width: '13%', textAlign: 'right' },
  colBalance: { width: '18%', textAlign: 'right' },
  // Type badges
  typeBadge: {
    fontSize: 7,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 2,
    alignSelf: 'flex-start',
  },
  typeInvoice: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  typePayment: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  typeWalletCredit: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
  },
  typeWalletDebit: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
  // Balance styling
  balancePositive: {
    color: '#dc2626',
    fontFamily: 'Helvetica-Bold',
  },
  balanceNegative: {
    color: '#16a34a',
    fontFamily: 'Helvetica-Bold',
  },
  balanceZero: {
    color: '#666666',
  },
  // Opening/Closing Balance Rows
  balanceRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: '#f5f5f5',
  },
  balanceRowText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
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
  // Page number
  pageNumber: {
    position: 'absolute',
    bottom: 20,
    right: 40,
    fontSize: 8,
    color: '#999999',
  },
  // Empty state
  emptyState: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 10,
    color: '#666666',
  },
});

// ============================================================
// Helpers
// ============================================================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'dd MMM yyyy');
  } catch {
    return dateStr;
  }
}

function getTypeStyle(type: StatementTransaction['type']) {
  switch (type) {
    case 'invoice':
      return styles.typeInvoice;
    case 'payment':
      return styles.typePayment;
    case 'wallet_credit':
      return styles.typeWalletCredit;
    case 'wallet_debit':
      return styles.typeWalletDebit;
    default:
      return {};
  }
}

function getTypeLabel(type: StatementTransaction['type']) {
  switch (type) {
    case 'invoice':
      return 'Invoice';
    case 'payment':
      return 'Payment';
    case 'wallet_credit':
      return 'Credit';
    case 'wallet_debit':
      return 'Debit';
    default:
      return type;
  }
}

// ============================================================
// PDF Component
// ============================================================

interface AccountStatementPDFProps {
  data: AccountStatementData;
  estateName?: string;
}

export function AccountStatementPDF({ data, estateName = 'Residio Estate' }: AccountStatementPDFProps) {
  const {
    resident,
    house,
    period,
    openingBalance,
    closingBalance,
    summary,
    transactions,
    generatedAt,
    generatedBy,
  } = data;

  // Determine balance status for styling
  const isClosingDebt = closingBalance > 0;
  const isClosingCredit = closingBalance < 0;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.estateName}>{estateName}</Text>
              <Text style={styles.estateSubtitle}>Account Statement</Text>
            </View>
            <View>
              <Text style={styles.documentTitle}>STATEMENT OF ACCOUNT</Text>
              <Text style={styles.statementPeriod}>
                {formatDate(period.from)} to {formatDate(period.to)}
              </Text>
            </View>
          </View>
        </View>

        {/* Account Info */}
        <View style={styles.accountInfo}>
          <View style={styles.accountBlock}>
            <Text style={styles.sectionTitle}>Account Holder</Text>
            <View style={styles.accountBox}>
              <Text style={styles.accountName}>{resident.name}</Text>
              <Text style={styles.accountDetail}>Code: {resident.resident_code}</Text>
              {resident.email && (
                <Text style={styles.accountDetail}>{resident.email}</Text>
              )}
              {resident.phone && (
                <Text style={styles.accountDetail}>{resident.phone}</Text>
              )}
            </View>
          </View>
          {house && (
            <View style={styles.accountBlock}>
              <Text style={styles.sectionTitle}>Property</Text>
              <View style={styles.accountBox}>
                <Text style={styles.accountName}>{house.short_name || house.address}</Text>
                <Text style={styles.accountDetail}>{house.address}</Text>
              </View>
            </View>
          )}
          <View style={styles.accountBlockRight}>
            <Text style={styles.sectionTitle}>Statement Date</Text>
            <View style={[styles.accountBox, { alignItems: 'flex-end' }]}>
              <Text style={styles.accountDetail}>Generated: {formatDate(generatedAt)}</Text>
              {generatedBy && (
                <Text style={styles.accountDetail}>By: {generatedBy}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Summary */}
        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>Account Summary</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Opening Balance</Text>
              <Text style={[
                styles.summaryValue,
                openingBalance > 0 ? styles.summaryValueDebt : openingBalance < 0 ? styles.summaryValueCredit : {}
              ]}>
                {formatCurrency(Math.abs(openingBalance))}
                {openingBalance > 0 ? ' DR' : openingBalance < 0 ? ' CR' : ''}
              </Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Total Invoiced</Text>
              <Text style={styles.summaryValue}>{formatCurrency(summary.totalInvoiced)}</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Total Paid</Text>
              <Text style={[styles.summaryValue, styles.summaryValueCredit]}>
                {formatCurrency(summary.totalPaid)}
              </Text>
            </View>
            <View style={[
              styles.summaryBox,
              isClosingDebt ? styles.summaryBoxDebt : isClosingCredit ? styles.summaryBoxCredit : styles.summaryBoxHighlight
            ]}>
              <Text style={styles.summaryLabel}>Closing Balance</Text>
              <Text style={[
                styles.summaryValue,
                isClosingDebt ? styles.summaryValueDebt : isClosingCredit ? styles.summaryValueCredit : {}
              ]}>
                {formatCurrency(Math.abs(closingBalance))}
                {isClosingDebt ? ' DR' : isClosingCredit ? ' CR' : ''}
              </Text>
            </View>
          </View>
        </View>

        {/* Transaction Table */}
        <View style={styles.transactionSection}>
          <Text style={styles.sectionTitle}>Transaction Details</Text>
          <View style={styles.table}>
            {/* Table Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, styles.colDate]}>Date</Text>
              <Text style={[styles.tableHeaderCell, styles.colType]}>Type</Text>
              <Text style={[styles.tableHeaderCell, styles.colDescription]}>Description</Text>
              <Text style={[styles.tableHeaderCell, styles.colDebit]}>Debit</Text>
              <Text style={[styles.tableHeaderCell, styles.colCredit]}>Credit</Text>
              <Text style={[styles.tableHeaderCell, styles.colBalance]}>Balance</Text>
            </View>

            {/* Opening Balance Row */}
            <View style={styles.balanceRow}>
              <Text style={[styles.balanceRowText, styles.colDate]}>
                {formatDate(period.from)}
              </Text>
              <Text style={[styles.balanceRowText, styles.colType]}></Text>
              <Text style={[styles.balanceRowText, styles.colDescription]}>
                Opening Balance
              </Text>
              <Text style={[styles.balanceRowText, styles.colDebit]}></Text>
              <Text style={[styles.balanceRowText, styles.colCredit]}></Text>
              <Text style={[
                styles.balanceRowText,
                styles.colBalance,
                openingBalance > 0 ? styles.balancePositive : openingBalance < 0 ? styles.balanceNegative : styles.balanceZero
              ]}>
                {formatCurrency(Math.abs(openingBalance))}
                {openingBalance > 0 ? ' DR' : openingBalance < 0 ? ' CR' : ''}
              </Text>
            </View>

            {/* Transaction Rows */}
            {transactions.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No transactions in this period</Text>
              </View>
            ) : (
              transactions.map((tx, index) => (
                <View
                  key={tx.id}
                  style={[
                    styles.tableRow,
                    index === transactions.length - 1 ? styles.tableRowLast : {},
                    index % 2 === 1 ? styles.tableRowAlt : {},
                  ]}
                >
                  <Text style={[styles.tableCell, styles.colDate]}>
                    {formatDate(tx.date)}
                  </Text>
                  <View style={styles.colType}>
                    <View style={[styles.typeBadge, getTypeStyle(tx.type)]}>
                      <Text>{getTypeLabel(tx.type)}</Text>
                    </View>
                  </View>
                  <View style={styles.colDescription}>
                    <Text style={styles.tableCell}>{tx.description}</Text>
                    {tx.reference && (
                      <Text style={[styles.tableCell, { color: '#999999', fontSize: 7 }]}>
                        Ref: {tx.reference}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.tableCell, styles.colDebit, tx.debit > 0 ? styles.summaryValueDebt : {}]}>
                    {tx.debit > 0 ? formatCurrency(tx.debit) : '-'}
                  </Text>
                  <Text style={[styles.tableCell, styles.colCredit, tx.credit > 0 ? styles.summaryValueCredit : {}]}>
                    {tx.credit > 0 ? formatCurrency(tx.credit) : '-'}
                  </Text>
                  <Text style={[
                    styles.tableCell,
                    styles.colBalance,
                    tx.balance > 0 ? styles.balancePositive : tx.balance < 0 ? styles.balanceNegative : styles.balanceZero
                  ]}>
                    {formatCurrency(Math.abs(tx.balance))}
                    {tx.balance > 0 ? ' DR' : tx.balance < 0 ? ' CR' : ''}
                  </Text>
                </View>
              ))
            )}

            {/* Closing Balance Row */}
            <View style={[styles.balanceRow, { borderTopWidth: 2, borderTopColor: '#1a1a1a' }]}>
              <Text style={[styles.balanceRowText, styles.colDate]}>
                {formatDate(period.to)}
              </Text>
              <Text style={[styles.balanceRowText, styles.colType]}></Text>
              <Text style={[styles.balanceRowText, styles.colDescription]}>
                Closing Balance
              </Text>
              <Text style={[styles.balanceRowText, styles.colDebit]}></Text>
              <Text style={[styles.balanceRowText, styles.colCredit]}></Text>
              <Text style={[
                styles.balanceRowText,
                styles.colBalance,
                isClosingDebt ? styles.balancePositive : isClosingCredit ? styles.balanceNegative : styles.balanceZero
              ]}>
                {formatCurrency(Math.abs(closingBalance))}
                {isClosingDebt ? ' DR' : isClosingCredit ? ' CR' : ''}
              </Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <View>
              <Text style={[styles.footerText, { fontFamily: 'Helvetica-Bold', marginBottom: 2 }]}>
                {estateName}
              </Text>
              <Text style={styles.footerText}>
                Powered by Residio
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.footerText}>
                This is an official account statement.
              </Text>
              <Text style={styles.footerText}>
                DR = Debit (Amount Owed) | CR = Credit (Overpayment)
              </Text>
            </View>
          </View>
        </View>

        {/* Page Number */}
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
