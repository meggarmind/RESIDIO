import { Document, Page, Text, View } from '@react-pdf/renderer';
import { reportPdfStyles as s } from '@/lib/pdf/reports/base-styles';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { FinancialOverviewData } from '@/actions/reports/report-engine';

export function FinancialOverviewPdf({ data }: { data: FinancialOverviewData }) {
  const { summary, creditCategories, debitCategories, monthlyTrend } = data;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.headerRow}>
            <View>
              <Text style={s.headerTitle}>Financial Overview</Text>
              <Text style={s.headerSubtitle}>Estate-wide income and expenditure summary</Text>
            </View>
            <View style={s.headerRight}>
              <Text style={s.headerRightTitle}>Residio</Text>
              <Text style={s.headerRightDate}>{formatDate(new Date())}</Text>
            </View>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Summary</Text>
          <View style={s.summaryRow}>
            <View style={s.summaryBox}>
              <Text style={s.summaryLabel}>Total Credits</Text>
              <Text style={[s.summaryValue, s.amountPositive]}>{formatCurrency(summary.totalCredits)}</Text>
            </View>
            <View style={s.summaryBox}>
              <Text style={s.summaryLabel}>Total Debits</Text>
              <Text style={[s.summaryValue, s.amountNegative]}>{formatCurrency(summary.totalDebits)}</Text>
            </View>
            <View style={s.summaryBox}>
              <Text style={s.summaryLabel}>Net Balance</Text>
              <Text style={[s.summaryValue, summary.netBalance >= 0 ? s.amountPositive : s.amountNegative]}>{formatCurrency(summary.netBalance)}</Text>
            </View>
          </View>
        </View>

        {creditCategories.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Income Categories</Text>
            <View style={s.table}>
              <View style={s.tableHeader}>
                <Text style={[s.tableHeaderCell, { flex: 3 }]}>Category</Text>
                <Text style={[s.tableHeaderCell, { flex: 2 }]}>Count</Text>
                <Text style={[s.tableHeaderCell, s.amountRight, { flex: 3 }]}>Amount</Text>
                <Text style={[s.tableHeaderCell, s.amountRight, { flex: 2 }]}>% of Total</Text>
              </View>
              {creditCategories.map((cat, i) => (
                <View key={i} style={[s.tableRow, i % 2 === 1 && s.tableRowAlt]}>
                  <Text style={[s.tableCell, { flex: 3 }]}>{cat.categoryName}</Text>
                  <Text style={[s.tableCell, { flex: 2 }]}>{cat.transactionCount}</Text>
                  <Text style={[s.tableCell, s.amountRight, { flex: 3 }]}>{formatCurrency(cat.totalAmount)}</Text>
                  <Text style={[s.tableCell, s.amountRight, { flex: 2 }]}>{cat.percentageOfTotal.toFixed(1)}%</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {debitCategories.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Expense Categories</Text>
            <View style={s.table}>
              <View style={s.tableHeader}>
                <Text style={[s.tableHeaderCell, { flex: 3 }]}>Category</Text>
                <Text style={[s.tableHeaderCell, { flex: 2 }]}>Count</Text>
                <Text style={[s.tableHeaderCell, s.amountRight, { flex: 3 }]}>Amount</Text>
                <Text style={[s.tableHeaderCell, s.amountRight, { flex: 2 }]}>% of Total</Text>
              </View>
              {debitCategories.map((cat, i) => (
                <View key={i} style={[s.tableRow, i % 2 === 1 && s.tableRowAlt]}>
                  <Text style={[s.tableCell, { flex: 3 }]}>{cat.categoryName}</Text>
                  <Text style={[s.tableCell, { flex: 2 }]}>{cat.transactionCount}</Text>
                  <Text style={[s.tableCell, s.amountRight, { flex: 3 }]}>{formatCurrency(cat.totalAmount)}</Text>
                  <Text style={[s.tableCell, s.amountRight, { flex: 2 }]}>{cat.percentageOfTotal.toFixed(1)}%</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {monthlyTrend.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Monthly Trend</Text>
            <View style={s.table}>
              <View style={s.tableHeader}>
                <Text style={[s.tableHeaderCell, { flex: 2 }]}>Month</Text>
                <Text style={[s.tableHeaderCell, s.amountRight, { flex: 3 }]}>Credits</Text>
                <Text style={[s.tableHeaderCell, s.amountRight, { flex: 3 }]}>Debits</Text>
                <Text style={[s.tableHeaderCell, s.amountRight, { flex: 3 }]}>Net</Text>
              </View>
              {monthlyTrend.map((m, i) => (
                <View key={i} style={[s.tableRow, i % 2 === 1 && s.tableRowAlt]}>
                  <Text style={[s.tableCell, { flex: 2 }]}>{m.month}</Text>
                  <Text style={[s.tableCell, s.amountRight, { flex: 3 }]}>{formatCurrency(m.credits)}</Text>
                  <Text style={[s.tableCell, s.amountRight, { flex: 3 }]}>{formatCurrency(m.debits)}</Text>
                  <Text style={[s.tableCell, s.amountRight, { flex: 3 }, m.net >= 0 ? s.amountPositive : s.amountNegative]}>{formatCurrency(m.net)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <Text style={s.footer}>Generated by Residio — Financial Overview Report</Text>
      </Page>
    </Document>
  );
}
