'use client';

import { forwardRef } from 'react';
import type {
  FinancialOverviewData,
  CollectionReportData,
  InvoiceAgingData,
  TransactionLogData,
  DebtorsReportData,
  IndebtednessSummaryData,
  IndebtednessDetailData,
  DevelopmentLevyData,
  ReportData
} from '@/actions/reports/report-engine';

// ============================================================
// Utility Functions
// ============================================================

const formatCurrency = (amount: number) => {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const formatMonthYear = (monthStr: string) => {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
};

// ============================================================
// Traditional Template Styles (Print-Optimized)
// ============================================================

const styles = {
  container: `
    font-family: 'Times New Roman', Times, serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 40px;
    background: white;
    color: #1a1a1a;
    line-height: 1.6;
  `,
  header: `
    text-align: center;
    border-bottom: 3px double #1a1a1a;
    padding-bottom: 24px;
    margin-bottom: 32px;
  `,
  estateName: `
    font-size: 24px;
    font-weight: bold;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 8px;
  `,
  reportTitle: `
    font-size: 18px;
    font-weight: normal;
    font-style: italic;
    margin-bottom: 8px;
  `,
  reportMeta: `
    font-size: 12px;
    color: #666;
  `,
  section: `
    margin-bottom: 32px;
  `,
  sectionTitle: `
    font-size: 14px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
    border-bottom: 1px solid #1a1a1a;
    padding-bottom: 8px;
    margin-bottom: 16px;
  `,
  summaryBox: `
    border: 1px solid #1a1a1a;
    padding: 20px;
    margin-bottom: 24px;
  `,
  summaryRow: `
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px dotted #ccc;
  `,
  summaryRowLast: `
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    font-weight: bold;
    border-top: 2px solid #1a1a1a;
    margin-top: 8px;
  `,
  table: `
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  `,
  th: `
    background: #f5f5f5;
    border: 1px solid #1a1a1a;
    padding: 10px 8px;
    text-align: left;
    font-weight: bold;
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.5px;
  `,
  thRight: `
    background: #f5f5f5;
    border: 1px solid #1a1a1a;
    padding: 10px 8px;
    text-align: right;
    font-weight: bold;
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.5px;
  `,
  td: `
    border: 1px solid #ccc;
    padding: 8px;
    vertical-align: top;
  `,
  tdRight: `
    border: 1px solid #ccc;
    padding: 8px;
    text-align: right;
    font-family: 'Courier New', monospace;
  `,
  tdCredit: `
    border: 1px solid #ccc;
    padding: 8px;
    text-align: right;
    font-family: 'Courier New', monospace;
    color: #006400;
  `,
  tdDebit: `
    border: 1px solid #ccc;
    padding: 8px;
    text-align: right;
    font-family: 'Courier New', monospace;
    color: #8B0000;
  `,
  footer: `
    margin-top: 48px;
    padding-top: 24px;
    border-top: 1px solid #ccc;
    font-size: 10px;
    color: #666;
    text-align: center;
  `,
  watermark: `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 100px;
    color: rgba(0, 0, 0, 0.03);
    pointer-events: none;
    z-index: 0;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 20px;
  `,
};

// ============================================================
// Financial Overview Template
// ============================================================

function FinancialOverviewTraditional({ data }: { data: FinancialOverviewData }) {
  return (
    <>
      {/* Summary Box */}
      <div style={{ ...parseStyles(styles.section) }}>
        <h2 style={{ ...parseStyles(styles.sectionTitle) }}>Executive Summary</h2>
        <div style={{ ...parseStyles(styles.summaryBox) }}>
          <div style={{ ...parseStyles(styles.summaryRow) }}>
            <span>Total Income (Credits)</span>
            <span style={{ color: '#006400', fontFamily: "'Courier New', monospace" }}>
              {formatCurrency(data.summary.totalCredits)}
            </span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRow) }}>
            <span>Total Expenses (Debits)</span>
            <span style={{ color: '#8B0000', fontFamily: "'Courier New', monospace" }}>
              ({formatCurrency(data.summary.totalDebits)})
            </span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRowLast) }}>
            <span>Net Balance</span>
            <span style={{
              color: data.summary.netBalance >= 0 ? '#006400' : '#8B0000',
              fontFamily: "'Courier New', monospace"
            }}>
              {formatCurrency(data.summary.netBalance)}
            </span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRow), borderBottom: 'none', paddingTop: '16px' }}>
            <span>Total Transactions</span>
            <span style={{ fontFamily: "'Courier New', monospace" }}>
              {data.summary.transactionCount.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Income Categories */}
      {data.creditCategories.length > 0 && (
        <div style={{ ...parseStyles(styles.section) }}>
          <h2 style={{ ...parseStyles(styles.sectionTitle) }}>Income by Category</h2>
          <table style={{ ...parseStyles(styles.table) }}>
            <thead>
              <tr>
                <th style={{ ...parseStyles(styles.th) }}>Category</th>
                <th style={{ ...parseStyles(styles.thRight) }}>Transactions</th>
                <th style={{ ...parseStyles(styles.thRight) }}>Amount</th>
                <th style={{ ...parseStyles(styles.thRight) }}>% of Total</th>
              </tr>
            </thead>
            <tbody>
              {data.creditCategories.map((cat, idx) => (
                <tr key={cat.categoryId || idx}>
                  <td style={{ ...parseStyles(styles.td) }}>{cat.categoryName}</td>
                  <td style={{ ...parseStyles(styles.tdRight) }}>{cat.transactionCount}</td>
                  <td style={{ ...parseStyles(styles.tdCredit) }}>{formatCurrency(cat.totalAmount)}</td>
                  <td style={{ ...parseStyles(styles.tdRight) }}>{cat.percentageOfTotal.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
                <td style={{ ...parseStyles(styles.td) }}>TOTAL</td>
                <td style={{ ...parseStyles(styles.tdRight) }}>
                  {data.creditCategories.reduce((sum, c) => sum + c.transactionCount, 0)}
                </td>
                <td style={{ ...parseStyles(styles.tdCredit) }}>{formatCurrency(data.summary.totalCredits)}</td>
                <td style={{ ...parseStyles(styles.tdRight) }}>100.0%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Expense Categories */}
      {data.debitCategories.length > 0 && (
        <div style={{ ...parseStyles(styles.section) }}>
          <h2 style={{ ...parseStyles(styles.sectionTitle) }}>Expenses by Category</h2>
          <table style={{ ...parseStyles(styles.table) }}>
            <thead>
              <tr>
                <th style={{ ...parseStyles(styles.th) }}>Category</th>
                <th style={{ ...parseStyles(styles.thRight) }}>Transactions</th>
                <th style={{ ...parseStyles(styles.thRight) }}>Amount</th>
                <th style={{ ...parseStyles(styles.thRight) }}>% of Total</th>
              </tr>
            </thead>
            <tbody>
              {data.debitCategories.map((cat, idx) => (
                <tr key={cat.categoryId || idx}>
                  <td style={{ ...parseStyles(styles.td) }}>{cat.categoryName}</td>
                  <td style={{ ...parseStyles(styles.tdRight) }}>{cat.transactionCount}</td>
                  <td style={{ ...parseStyles(styles.tdDebit) }}>({formatCurrency(cat.totalAmount)})</td>
                  <td style={{ ...parseStyles(styles.tdRight) }}>{cat.percentageOfTotal.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
                <td style={{ ...parseStyles(styles.td) }}>TOTAL</td>
                <td style={{ ...parseStyles(styles.tdRight) }}>
                  {data.debitCategories.reduce((sum, c) => sum + c.transactionCount, 0)}
                </td>
                <td style={{ ...parseStyles(styles.tdDebit) }}>({formatCurrency(data.summary.totalDebits)})</td>
                <td style={{ ...parseStyles(styles.tdRight) }}>100.0%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Monthly Trend */}
      {data.monthlyTrend.length > 0 && (
        <div style={{ ...parseStyles(styles.section) }}>
          <h2 style={{ ...parseStyles(styles.sectionTitle) }}>Monthly Summary</h2>
          <table style={{ ...parseStyles(styles.table) }}>
            <thead>
              <tr>
                <th style={{ ...parseStyles(styles.th) }}>Period</th>
                <th style={{ ...parseStyles(styles.thRight) }}>Income</th>
                <th style={{ ...parseStyles(styles.thRight) }}>Expenses</th>
                <th style={{ ...parseStyles(styles.thRight) }}>Net</th>
              </tr>
            </thead>
            <tbody>
              {data.monthlyTrend.map((month) => (
                <tr key={month.month}>
                  <td style={{ ...parseStyles(styles.td) }}>{formatMonthYear(month.month)}</td>
                  <td style={{ ...parseStyles(styles.tdCredit) }}>{formatCurrency(month.credits)}</td>
                  <td style={{ ...parseStyles(styles.tdDebit) }}>({formatCurrency(month.debits)})</td>
                  <td style={{
                    ...parseStyles(styles.tdRight),
                    color: month.net >= 0 ? '#006400' : '#8B0000'
                  }}>
                    {formatCurrency(month.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ============================================================
// Collection Report Template
// ============================================================

function CollectionReportTraditional({ data }: { data: CollectionReportData }) {
  return (
    <>
      {/* Summary */}
      <div style={{ ...parseStyles(styles.section) }}>
        <h2 style={{ ...parseStyles(styles.sectionTitle) }}>Collection Summary</h2>
        <div style={{ ...parseStyles(styles.summaryBox) }}>
          <div style={{ ...parseStyles(styles.summaryRow) }}>
            <span>Total Amount Invoiced</span>
            <span style={{ fontFamily: "'Courier New', monospace" }}>
              {formatCurrency(data.summary.totalInvoiced)}
            </span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRow) }}>
            <span>Total Amount Collected</span>
            <span style={{ color: '#006400', fontFamily: "'Courier New', monospace" }}>
              {formatCurrency(data.summary.totalCollected)}
            </span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRowLast) }}>
            <span>Outstanding Balance</span>
            <span style={{ color: '#8B0000', fontFamily: "'Courier New', monospace" }}>
              {formatCurrency(data.summary.totalOutstanding)}
            </span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRow), borderBottom: 'none', paddingTop: '16px' }}>
            <span>Collection Rate</span>
            <span style={{ fontWeight: 'bold' }}>
              {data.summary.collectionRate.toFixed(1)}%
            </span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRow), borderBottom: 'none' }}>
            <span>Residents with Outstanding Balance</span>
            <span>{data.summary.residentsWithDebts} of {data.summary.totalResidents}</span>
          </div>
        </div>
      </div>

      {/* By Resident */}
      <div style={{ ...parseStyles(styles.section) }}>
        <h2 style={{ ...parseStyles(styles.sectionTitle) }}>Outstanding by Resident</h2>
        <table style={{ ...parseStyles(styles.table) }}>
          <thead>
            <tr>
              <th style={{ ...parseStyles(styles.th) }}>Resident</th>
              <th style={{ ...parseStyles(styles.th) }}>Property</th>
              <th style={{ ...parseStyles(styles.thRight) }}>Invoiced</th>
              <th style={{ ...parseStyles(styles.thRight) }}>Paid</th>
              <th style={{ ...parseStyles(styles.thRight) }}>Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {data.byResident.filter(r => r.outstanding > 0).map((resident) => (
              <tr key={resident.residentId}>
                <td style={{ ...parseStyles(styles.td) }}>
                  {resident.residentName}<br />
                  <small style={{ color: '#666' }}>{resident.residentCode}</small>
                </td>
                <td style={{ ...parseStyles(styles.td) }}>
                  {resident.houseNumber}, {resident.streetName}
                </td>
                <td style={{ ...parseStyles(styles.tdRight) }}>{formatCurrency(resident.totalInvoiced)}</td>
                <td style={{ ...parseStyles(styles.tdCredit) }}>{formatCurrency(resident.totalPaid)}</td>
                <td style={{ ...parseStyles(styles.tdDebit) }}>{formatCurrency(resident.outstanding)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
              <td style={{ ...parseStyles(styles.td) }} colSpan={2}>TOTAL</td>
              <td style={{ ...parseStyles(styles.tdRight) }}>{formatCurrency(data.summary.totalInvoiced)}</td>
              <td style={{ ...parseStyles(styles.tdCredit) }}>{formatCurrency(data.summary.totalCollected)}</td>
              <td style={{ ...parseStyles(styles.tdDebit) }}>{formatCurrency(data.summary.totalOutstanding)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

// ============================================================
// Invoice Aging Template
// ============================================================

function InvoiceAgingTraditional({ data }: { data: InvoiceAgingData }) {
  return (
    <>
      {/* Summary */}
      <div style={{ ...parseStyles(styles.section) }}>
        <h2 style={{ ...parseStyles(styles.sectionTitle) }}>Aging Summary</h2>
        <div style={{ ...parseStyles(styles.summaryBox) }}>
          <div style={{ ...parseStyles(styles.summaryRow) }}>
            <span>Current (0-30 days)</span>
            <span style={{ fontFamily: "'Courier New', monospace" }}>{formatCurrency(data.summary.current)}</span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRow) }}>
            <span>31-60 days</span>
            <span style={{ fontFamily: "'Courier New', monospace" }}>{formatCurrency(data.summary.days30to60)}</span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRow) }}>
            <span>61-90 days</span>
            <span style={{ fontFamily: "'Courier New', monospace" }}>{formatCurrency(data.summary.days60to90)}</span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRow) }}>
            <span>Over 90 days</span>
            <span style={{ color: '#8B0000', fontFamily: "'Courier New', monospace" }}>{formatCurrency(data.summary.over90Days)}</span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRowLast) }}>
            <span>Total Outstanding</span>
            <span style={{ fontFamily: "'Courier New', monospace" }}>{formatCurrency(data.summary.totalOutstanding)}</span>
          </div>
        </div>
      </div>

      {/* By Bracket */}
      {data.byBracket.map((bracket) => (
        bracket.invoices.length > 0 && (
          <div key={bracket.bracket} style={{ ...parseStyles(styles.section) }}>
            <h2 style={{ ...parseStyles(styles.sectionTitle) }}>
              {bracket.bracket} - {formatCurrency(bracket.totalAmount)} ({bracket.percentage.toFixed(1)}%)
            </h2>
            <table style={{ ...parseStyles(styles.table) }}>
              <thead>
                <tr>
                  <th style={{ ...parseStyles(styles.th) }}>Invoice #</th>
                  <th style={{ ...parseStyles(styles.th) }}>Resident</th>
                  <th style={{ ...parseStyles(styles.th) }}>House</th>
                  <th style={{ ...parseStyles(styles.thRight) }}>Due Date</th>
                  <th style={{ ...parseStyles(styles.thRight) }}>Days Overdue</th>
                  <th style={{ ...parseStyles(styles.thRight) }}>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {bracket.invoices.map((inv) => (
                  <tr key={inv.invoiceId}>
                    <td style={{ ...parseStyles(styles.td) }}>{inv.invoiceNumber}</td>
                    <td style={{ ...parseStyles(styles.td) }}>{inv.residentName}</td>
                    <td style={{ ...parseStyles(styles.td) }}>{inv.houseNumber}</td>
                    <td style={{ ...parseStyles(styles.tdRight) }}>{formatDate(inv.dueDate)}</td>
                    <td style={{ ...parseStyles(styles.tdRight) }}>{inv.daysOverdue}</td>
                    <td style={{ ...parseStyles(styles.tdDebit) }}>{formatCurrency(inv.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ))}
    </>
  );
}

// ============================================================
// Transaction Log Template
// ============================================================

function TransactionLogTraditional({ data }: { data: TransactionLogData }) {
  return (
    <>
      {/* Summary */}
      <div style={{ ...parseStyles(styles.section) }}>
        <h2 style={{ ...parseStyles(styles.sectionTitle) }}>Transaction Summary</h2>
        <div style={{ ...parseStyles(styles.summaryBox) }}>
          <div style={{ ...parseStyles(styles.summaryRow) }}>
            <span>Report Period</span>
            <span>{formatDate(data.summary.dateRange.start)} to {formatDate(data.summary.dateRange.end)}</span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRow) }}>
            <span>Total Transactions</span>
            <span style={{ fontFamily: "'Courier New', monospace" }}>{data.summary.totalTransactions}</span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRow) }}>
            <span>Total Credits</span>
            <span style={{ color: '#006400', fontFamily: "'Courier New', monospace" }}>{formatCurrency(data.summary.totalCredits)}</span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRow), borderBottom: 'none' }}>
            <span>Total Debits</span>
            <span style={{ color: '#8B0000', fontFamily: "'Courier New', monospace" }}>({formatCurrency(data.summary.totalDebits)})</span>
          </div>
        </div>
      </div>

      {/* Transaction List */}
      <div style={{ ...parseStyles(styles.section) }}>
        <h2 style={{ ...parseStyles(styles.sectionTitle) }}>Transaction Details</h2>
        <table style={{ ...parseStyles(styles.table) }}>
          <thead>
            <tr>
              <th style={{ ...parseStyles(styles.th) }}>Date</th>
              <th style={{ ...parseStyles(styles.th) }}>Description</th>
              <th style={{ ...parseStyles(styles.th) }}>Category</th>
              <th style={{ ...parseStyles(styles.thRight) }}>Credit</th>
              <th style={{ ...parseStyles(styles.thRight) }}>Debit</th>
            </tr>
          </thead>
          <tbody>
            {data.transactions.map((txn) => (
              <tr key={txn.id}>
                <td style={{ ...parseStyles(styles.td), whiteSpace: 'nowrap' }}>{formatDate(txn.date)}</td>
                <td style={{ ...parseStyles(styles.td), maxWidth: '250px' }}>
                  {txn.description}
                  {txn.reference && <><br /><small style={{ color: '#666' }}>Ref: {txn.reference}</small></>}
                </td>
                <td style={{ ...parseStyles(styles.td) }}>{txn.category}</td>
                <td style={{ ...parseStyles(styles.tdCredit) }}>
                  {txn.type === 'credit' ? formatCurrency(txn.amount) : '-'}
                </td>
                <td style={{ ...parseStyles(styles.tdDebit) }}>
                  {txn.type === 'debit' ? `(${formatCurrency(txn.amount)})` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
              <td style={{ ...parseStyles(styles.td) }} colSpan={3}>TOTALS</td>
              <td style={{ ...parseStyles(styles.tdCredit) }}>{formatCurrency(data.summary.totalCredits)}</td>
              <td style={{ ...parseStyles(styles.tdDebit) }}>({formatCurrency(data.summary.totalDebits)})</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

// ============================================================
// Debtors Report Template
// ============================================================

function DebtorsReportTraditional({ data }: { data: DebtorsReportData }) {
  return (
    <>
      {/* Summary */}
      <div style={{ ...parseStyles(styles.section) }}>
        <h2 style={{ ...parseStyles(styles.sectionTitle) }}>Debtors Summary</h2>
        <div style={{ ...parseStyles(styles.summaryBox) }}>
          <div style={{ ...parseStyles(styles.summaryRow) }}>
            <span>Total Debtors</span>
            <span style={{ fontFamily: "'Courier New', monospace" }}>{data.summary.totalDebtors}</span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRow) }}>
            <span>Current (0-30 days)</span>
            <span style={{ fontFamily: "'Courier New', monospace" }}>{formatCurrency(data.summary.current)}</span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRow) }}>
            <span>31-60 days</span>
            <span style={{ fontFamily: "'Courier New', monospace" }}>{formatCurrency(data.summary.days31to60)}</span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRow) }}>
            <span>61-90 days</span>
            <span style={{ fontFamily: "'Courier New', monospace" }}>{formatCurrency(data.summary.days61to90)}</span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRow) }}>
            <span>Over 90 days</span>
            <span style={{ color: '#8B0000', fontFamily: "'Courier New', monospace" }}>{formatCurrency(data.summary.over90Days)}</span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRowLast) }}>
            <span>Total Outstanding</span>
            <span style={{ fontFamily: "'Courier New', monospace" }}>{formatCurrency(data.summary.totalOutstanding)}</span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRow), borderBottom: 'none', paddingTop: '16px' }}>
            <span>Average Debt per Debtor</span>
            <span style={{ fontFamily: "'Courier New', monospace" }}>{formatCurrency(data.summary.averageDebt)}</span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRow), borderBottom: 'none' }}>
            <span>Average Days Overdue</span>
            <span style={{ fontFamily: "'Courier New', monospace" }}>{Math.round(data.summary.averageDaysOverdue)} days</span>
          </div>
        </div>
      </div>

      {/* Debtors List with Contact Info */}
      <div style={{ ...parseStyles(styles.section) }}>
        <h2 style={{ ...parseStyles(styles.sectionTitle) }}>Debtors List (For Follow-up Actions)</h2>
        <table style={{ ...parseStyles(styles.table) }}>
          <thead>
            <tr>
              <th style={{ ...parseStyles(styles.th) }}>Debtor / Property</th>
              <th style={{ ...parseStyles(styles.th) }}>Contact Information</th>
              <th style={{ ...parseStyles(styles.thRight) }}>Invoices</th>
              <th style={{ ...parseStyles(styles.thRight) }}>Days Overdue</th>
              <th style={{ ...parseStyles(styles.thRight) }}>Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {data.debtors.map((debtor) => (
              <tr key={debtor.residentId}>
                <td style={{ ...parseStyles(styles.td) }}>
                  <strong>{debtor.residentName}</strong><br />
                  <small style={{ color: '#666' }}>{debtor.residentCode}</small><br />
                  <span>{debtor.houseNumber}, {debtor.streetName}</span>
                </td>
                <td style={{ ...parseStyles(styles.td) }}>
                  {debtor.phonePrimary && (
                    <div>Tel: {debtor.phonePrimary}</div>
                  )}
                  {debtor.phoneSecondary && (
                    <div>Alt: {debtor.phoneSecondary}</div>
                  )}
                  {debtor.email && (
                    <div>Email: {debtor.email}</div>
                  )}
                  {!debtor.phonePrimary && !debtor.email && (
                    <em style={{ color: '#999' }}>No contact info</em>
                  )}
                </td>
                <td style={{ ...parseStyles(styles.tdRight) }}>{debtor.invoiceCount}</td>
                <td style={{
                  ...parseStyles(styles.tdRight),
                  color: debtor.daysOverdue > 90 ? '#8B0000' : debtor.daysOverdue > 30 ? '#B8860B' : 'inherit',
                  fontWeight: debtor.daysOverdue > 60 ? 'bold' : 'normal',
                }}>
                  {debtor.daysOverdue}
                </td>
                <td style={{ ...parseStyles(styles.tdDebit) }}>
                  {formatCurrency(debtor.totalOutstanding)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
              <td style={{ ...parseStyles(styles.td) }} colSpan={2}>TOTAL ({data.summary.totalDebtors} debtors)</td>
              <td style={{ ...parseStyles(styles.tdRight) }}>{data.debtors.reduce((sum, d) => sum + d.invoiceCount, 0)}</td>
              <td style={{ ...parseStyles(styles.tdRight) }}>{Math.round(data.summary.averageDaysOverdue)} avg</td>
              <td style={{ ...parseStyles(styles.tdDebit) }}>{formatCurrency(data.summary.totalOutstanding)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Aging Breakdown by Debtor */}
      <div style={{ ...parseStyles(styles.section) }}>
        <h2 style={{ ...parseStyles(styles.sectionTitle) }}>Aging Breakdown by Debtor</h2>
        <table style={{ ...parseStyles(styles.table) }}>
          <thead>
            <tr>
              <th style={{ ...parseStyles(styles.th) }}>Debtor</th>
              <th style={{ ...parseStyles(styles.thRight) }}>0-30 Days</th>
              <th style={{ ...parseStyles(styles.thRight) }}>31-60 Days</th>
              <th style={{ ...parseStyles(styles.thRight) }}>61-90 Days</th>
              <th style={{ ...parseStyles(styles.thRight) }}>Over 90 Days</th>
              <th style={{ ...parseStyles(styles.thRight) }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {data.debtors.filter(d => d.totalOutstanding > 0).map((debtor) => (
              <tr key={debtor.residentId}>
                <td style={{ ...parseStyles(styles.td) }}>
                  {debtor.residentName}<br />
                  <small style={{ color: '#666' }}>{debtor.houseNumber}</small>
                </td>
                <td style={{ ...parseStyles(styles.tdRight) }}>
                  {debtor.current > 0 ? formatCurrency(debtor.current) : '-'}
                </td>
                <td style={{ ...parseStyles(styles.tdRight), color: debtor.days31to60 > 0 ? '#B8860B' : 'inherit' }}>
                  {debtor.days31to60 > 0 ? formatCurrency(debtor.days31to60) : '-'}
                </td>
                <td style={{ ...parseStyles(styles.tdRight), color: debtor.days61to90 > 0 ? '#CD853F' : 'inherit' }}>
                  {debtor.days61to90 > 0 ? formatCurrency(debtor.days61to90) : '-'}
                </td>
                <td style={{ ...parseStyles(styles.tdDebit) }}>
                  {debtor.over90Days > 0 ? formatCurrency(debtor.over90Days) : '-'}
                </td>
                <td style={{ ...parseStyles(styles.tdDebit), fontWeight: 'bold' }}>
                  {formatCurrency(debtor.totalOutstanding)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
              <td style={{ ...parseStyles(styles.td) }}>TOTAL</td>
              <td style={{ ...parseStyles(styles.tdRight) }}>{formatCurrency(data.summary.current)}</td>
              <td style={{ ...parseStyles(styles.tdRight), color: '#B8860B' }}>{formatCurrency(data.summary.days31to60)}</td>
              <td style={{ ...parseStyles(styles.tdRight), color: '#CD853F' }}>{formatCurrency(data.summary.days61to90)}</td>
              <td style={{ ...parseStyles(styles.tdDebit) }}>{formatCurrency(data.summary.over90Days)}</td>
              <td style={{ ...parseStyles(styles.tdDebit) }}>{formatCurrency(data.summary.totalOutstanding)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

// ============================================================
// Indebtedness Summary Template
// ============================================================

function IndebtednessSummaryTraditional({ data }: { data: IndebtednessSummaryData }) {
  return (
    <>
      {/* Summary */}
      <div style={{ ...parseStyles(styles.section) }}>
        <h2 style={{ ...parseStyles(styles.sectionTitle) }}>Indebtedness Summary</h2>
        <div style={{ ...parseStyles(styles.summaryBox) }}>
          <div style={{ ...parseStyles(styles.summaryRow) }}>
            <span>Total Properties Counted</span>
            <span style={{ fontFamily: "'Courier New', monospace" }}>{data.summary.totalHouses}</span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRow) }}>
            <span>Indebted Properties</span>
            <span style={{ color: '#8B0000', fontFamily: "'Courier New', monospace" }}>{data.summary.indebtedCount}</span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRow), borderBottom: 'none' }}>
            <span>Non-Indebted Properties</span>
            <span style={{ color: '#006400', fontFamily: "'Courier New', monospace" }}>{data.summary.nonIndebtedCount}</span>
          </div>
        </div>
      </div>

      {/* Property List */}
      <div style={{ ...parseStyles(styles.section) }}>
        <h2 style={{ ...parseStyles(styles.sectionTitle) }}>Property Indebtedness Status</h2>
        <table style={{ ...parseStyles(styles.table) }}>
          <thead>
            <tr>
              <th style={{ ...parseStyles(styles.th) }}>Property</th>
              <th style={{ ...parseStyles(styles.th) }}>Resident Name</th>
              <th style={{ ...parseStyles(styles.thRight) }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.houses.map((house) => (
              <tr key={house.houseId}>
                <td style={{ ...parseStyles(styles.td) }}>
                  {house.houseNumber}, {house.streetName}
                </td>
                <td style={{ ...parseStyles(styles.td) }}>{house.primaryResidentName}</td>
                <td style={{
                  ...parseStyles(styles.tdRight),
                  color: house.isIndebted ? '#8B0000' : '#006400',
                  fontWeight: 'bold'
                }}>
                  {house.isIndebted ? 'INDEBTED' : 'CLEAR'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ============================================================
// Indebtedness Detail Template
// ============================================================

function IndebtednessDetailTraditional({ data }: { data: IndebtednessDetailData }) {
  return (
    <>
      {/* Summary */}
      <div style={{ ...parseStyles(styles.section) }}>
        <h2 style={{ ...parseStyles(styles.sectionTitle) }}>Indebtedness Detail Summary</h2>
        <div style={{ ...parseStyles(styles.summaryBox) }}>
          <div style={{ ...parseStyles(styles.summaryRow) }}>
            <span>Total Properties</span>
            <span style={{ fontFamily: "'Courier New', monospace" }}>{data.summary.totalHouses}</span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRow) }}>
            <span>Debt-Bearing Properties</span>
            <span style={{ color: '#8B0000', fontFamily: "'Courier New', monospace" }}>{data.summary.indebtedCount}</span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRowLast) }}>
            <span>Total Outstanding Debt</span>
            <span style={{ color: '#8B0000', fontFamily: "'Courier New', monospace" }}>
              {formatCurrency(data.summary.totalOutstanding)}
            </span>
          </div>
        </div>
      </div>

      {/* Detailed List */}
      <div style={{ ...parseStyles(styles.section) }}>
        <h2 style={{ ...parseStyles(styles.sectionTitle) }}>Outstanding Balances by Property</h2>
        <table style={{ ...parseStyles(styles.table) }}>
          <thead>
            <tr>
              <th style={{ ...parseStyles(styles.th) }}>Property</th>
              <th style={{ ...parseStyles(styles.th) }}>Resident Name</th>
              <th style={{ ...parseStyles(styles.thRight) }}>Amount Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {data.houses.filter(h => h.isIndebted).map((house) => (
              <tr key={house.houseId}>
                <td style={{ ...parseStyles(styles.td) }}>
                  {house.houseNumber}, {house.streetName}
                </td>
                <td style={{ ...parseStyles(styles.td) }}>{house.primaryResidentName}</td>
                <td style={{ ...parseStyles(styles.tdDebit) }}>
                  {formatCurrency(house.outstandingAmount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
              <td style={{ ...parseStyles(styles.td) }} colSpan={2}>TOTAL OUTSTANDING</td>
              <td style={{ ...parseStyles(styles.tdDebit) }}>{formatCurrency(data.summary.totalOutstanding)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

// ============================================================
// Development Levy Template
// ============================================================

function DevelopmentLevyTraditional({ data }: { data: DevelopmentLevyData }) {
  return (
    <>
      {/* Summary */}
      <div style={{ ...parseStyles(styles.section) }}>
        <h2 style={{ ...parseStyles(styles.sectionTitle) }}>Development Levy Collection Summary</h2>
        <div style={{ ...parseStyles(styles.summaryBox) }}>
          <div style={{ ...parseStyles(styles.summaryRow) }}>
            <span>Total Expected</span>
            <span style={{ fontFamily: "'Courier New', monospace" }}>{formatCurrency(data.summary.totalAmount)}</span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRow) }}>
            <span>Total Collected</span>
            <span style={{ color: '#006400', fontFamily: "'Courier New', monospace" }}>{formatCurrency(data.summary.collectedAmount)}</span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRowLast) }}>
            <span>Outstanding</span>
            <span style={{ color: '#8B0000', fontFamily: "'Courier New', monospace" }}>
              {formatCurrency(data.summary.totalAmount - data.summary.collectedAmount)}
            </span>
          </div>
          <div style={{ ...parseStyles(styles.summaryRow), borderBottom: 'none', paddingTop: '16px' }}>
            <span>Collection Progress</span>
            <span style={{ fontWeight: 'bold' }}>{data.summary.collectionRate.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Property List */}
      <div style={{ ...parseStyles(styles.section) }}>
        <h2 style={{ ...parseStyles(styles.sectionTitle) }}>Levy Payment Status by Property</h2>
        <table style={{ ...parseStyles(styles.table) }}>
          <thead>
            <tr>
              <th style={{ ...parseStyles(styles.th) }}>Property</th>
              <th style={{ ...parseStyles(styles.th) }}>Responsible Party</th>
              <th style={{ ...parseStyles(styles.thRight) }}>Levy Amount</th>
              <th style={{ ...parseStyles(styles.thRight) }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.houses.map((house) => (
              <tr key={house.houseId}>
                <td style={{ ...parseStyles(styles.td) }}>
                  {house.houseNumber}, {house.streetName}
                </td>
                <td style={{ ...parseStyles(styles.td) }}>
                  {house.responsibleResidentName}<br />
                  <small style={{ color: '#666' }}>{house.residentRole.replace(/_/g, ' ')}</small>
                </td>
                <td style={{ ...parseStyles(styles.tdRight) }}>{formatCurrency(house.levyAmount)}</td>
                <td style={{
                  ...parseStyles(styles.tdRight),
                  color: house.isPaid ? '#006400' : '#8B0000',
                  fontWeight: 'bold'
                }}>
                  {house.isPaid ? 'PAID' : 'PENDING'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ============================================================
// Helper to parse inline styles
// ============================================================

function parseStyles(styleString: string): React.CSSProperties {
  const style: Record<string, string> = {};
  styleString.split(';').forEach((declaration) => {
    const [property, value] = declaration.split(':').map((s) => s.trim());
    if (property && value) {
      // Convert kebab-case to camelCase
      const camelProperty = property.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
      style[camelProperty] = value;
    }
  });
  return style as React.CSSProperties;
}

// ============================================================
// Main Traditional Template Component
// ============================================================

interface TraditionalTemplateProps {
  report: ReportData;
  title: string;
  dateRange?: { start: string; end: string };
  estateName?: string;
}

export const TraditionalTemplate = forwardRef<HTMLDivElement, TraditionalTemplateProps>(
  function TraditionalTemplate({ report, title, dateRange, estateName = 'Residio Estate' }, ref) {
    const generatedDate = new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <div ref={ref} style={{ ...parseStyles(styles.container), position: 'relative' }}>
        {/* Watermark */}
        <div style={{ ...parseStyles(styles.watermark) }}>RESIDIO</div>

        {/* Header */}
        <header style={{ ...parseStyles(styles.header) }}>
          <h1 style={{ ...parseStyles(styles.estateName) }}>{estateName}</h1>
          <h2 style={{ ...parseStyles(styles.reportTitle) }}>{title}</h2>
          {dateRange && (
            <p style={{ ...parseStyles(styles.reportMeta) }}>
              Period: {formatDate(dateRange.start)} to {formatDate(dateRange.end)}
            </p>
          )}
          <p style={{ ...parseStyles(styles.reportMeta) }}>
            Generated: {generatedDate}
          </p>
        </header>

        {/* Report Content */}
        <main>
          {report.type === 'financial_overview' && (
            <FinancialOverviewTraditional data={report.data} />
          )}
          {report.type === 'collection_report' && (
            <CollectionReportTraditional data={report.data} />
          )}
          {report.type === 'invoice_aging' && (
            <InvoiceAgingTraditional data={report.data} />
          )}
          {report.type === 'transaction_log' && (
            <TransactionLogTraditional data={report.data} />
          )}
          {report.type === 'debtors_report' && (
            <DebtorsReportTraditional data={report.data} />
          )}
          {report.type === 'indebtedness_summary' && (
            <IndebtednessSummaryTraditional data={report.data} />
          )}
          {report.type === 'indebtedness_detail' && (
            <IndebtednessDetailTraditional data={report.data} />
          )}
          {report.type === 'development_levy' && (
            <DevelopmentLevyTraditional data={report.data} />
          )}
        </main>

        {/* Footer */}
        <footer style={{ ...parseStyles(styles.footer) }}>
          <p>This is a computer-generated document. No signature is required.</p>
          <p style={{ marginTop: '8px' }}>
            {estateName} Financial Management System | Page 1 of 1
          </p>
        </footer>
      </div>
    );
  }
);
