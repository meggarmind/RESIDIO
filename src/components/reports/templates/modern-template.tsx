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
    month: 'short',
    year: 'numeric',
  });
};

const formatMonthYear = (monthStr: string) => {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
};

// ============================================================
// Design Tokens
// ============================================================

const colors = {
  primary: '#6366f1',      // Indigo
  primaryDark: '#4f46e5',
  success: '#10b981',      // Emerald
  successDark: '#059669',
  danger: '#ef4444',       // Red
  dangerDark: '#dc2626',
  warning: '#f59e0b',      // Amber
  warningDark: '#d97706',
  slate: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  }
};

// ============================================================
// Reusable Components
// ============================================================

function StatCard({
  label,
  value,
  subValue,
  color = 'primary',
  icon,
}: {
  label: string;
  value: string;
  subValue?: string;
  color?: 'primary' | 'success' | 'danger' | 'warning';
  icon?: React.ReactNode;
}) {
  const colorMap = {
    primary: { bg: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', text: '#fff' },
    success: { bg: 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)', text: '#fff' },
    danger: { bg: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)', text: '#fff' },
    warning: { bg: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)', text: '#fff' },
  };

  return (
    <div style={{
      background: colorMap[color].bg,
      borderRadius: '16px',
      padding: '24px',
      color: colorMap[color].text,
      boxShadow: '0 10px 40px -10px rgba(0,0,0,0.2)',
      flex: '1 1 200px',
      minWidth: '200px',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: '12px',
      }}>
        <span style={{
          fontSize: '13px',
          fontWeight: '500',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          opacity: 0.9,
        }}>
          {label}
        </span>
        {icon}
      </div>
      <div style={{
        fontSize: '28px',
        fontWeight: '700',
        letterSpacing: '-0.5px',
        marginBottom: subValue ? '4px' : 0,
      }}>
        {value}
      </div>
      {subValue && (
        <div style={{
          fontSize: '13px',
          opacity: 0.85,
        }}>
          {subValue}
        </div>
      )}
    </div>
  );
}

function ProgressBar({
  value,
  max = 100,
  color = colors.primary,
  label,
  showPercentage = true,
}: {
  value: number;
  max?: number;
  color?: string;
  label?: string;
  showPercentage?: boolean;
}) {
  const percentage = Math.min(100, (value / max) * 100);

  return (
    <div style={{ marginBottom: '12px' }}>
      {label && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '6px',
          fontSize: '13px',
          color: colors.slate[600],
        }}>
          <span>{label}</span>
          {showPercentage && <span style={{ fontWeight: '600' }}>{percentage.toFixed(1)}%</span>}
        </div>
      )}
      <div style={{
        height: '8px',
        backgroundColor: colors.slate[200],
        borderRadius: '4px',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${percentage}%`,
          background: `linear-gradient(90deg, ${color} 0%, ${color}dd 100%)`,
          borderRadius: '4px',
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  );
}

function DataCard({
  title,
  children,
  headerAction,
}: {
  title: string;
  children: React.ReactNode;
  headerAction?: React.ReactNode;
}) {
  return (
    <div style={{
      backgroundColor: '#fff',
      borderRadius: '16px',
      border: `1px solid ${colors.slate[200]}`,
      overflow: 'hidden',
      marginBottom: '24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    }}>
      <div style={{
        padding: '16px 20px',
        borderBottom: `1px solid ${colors.slate[200]}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: colors.slate[50],
      }}>
        <h3 style={{
          fontSize: '14px',
          fontWeight: '600',
          color: colors.slate[800],
          margin: 0,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}>
          {title}
        </h3>
        {headerAction}
      </div>
      <div style={{ padding: '20px' }}>
        {children}
      </div>
    </div>
  );
}

// ============================================================
// Financial Overview Template
// ============================================================

function FinancialOverviewModern({ data }: { data: FinancialOverviewData }) {
  const categoryColors = [
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
    '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  ];

  return (
    <>
      {/* Summary Cards */}
      <div style={{
        display: 'flex',
        gap: '16px',
        flexWrap: 'wrap',
        marginBottom: '32px',
      }}>
        <StatCard
          label="Total Income"
          value={formatCurrency(data.summary.totalCredits)}
          subValue={`${data.summary.transactionCount} transactions`}
          color="success"
        />
        <StatCard
          label="Total Expenses"
          value={formatCurrency(data.summary.totalDebits)}
          color="danger"
        />
        <StatCard
          label="Net Balance"
          value={formatCurrency(data.summary.netBalance)}
          color={data.summary.netBalance >= 0 ? 'primary' : 'danger'}
        />
      </div>

      {/* Income Categories */}
      {data.creditCategories.length > 0 && (
        <DataCard title="Income Breakdown">
          <div style={{ display: 'grid', gap: '16px' }}>
            {data.creditCategories.map((cat, idx) => (
              <div key={cat.categoryId || idx}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '3px',
                      backgroundColor: categoryColors[idx % categoryColors.length],
                    }} />
                    <span style={{
                      fontSize: '14px',
                      fontWeight: '500',
                      color: colors.slate[700],
                    }}>
                      {cat.categoryName}
                    </span>
                    <span style={{
                      fontSize: '12px',
                      color: colors.slate[400],
                      backgroundColor: colors.slate[100],
                      padding: '2px 8px',
                      borderRadius: '12px',
                    }}>
                      {cat.transactionCount} txns
                    </span>
                  </div>
                  <span style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: colors.success,
                  }}>
                    {formatCurrency(cat.totalAmount)}
                  </span>
                </div>
                <ProgressBar
                  value={cat.percentageOfTotal}
                  color={categoryColors[idx % categoryColors.length]}
                  showPercentage={false}
                />
              </div>
            ))}
          </div>
        </DataCard>
      )}

      {/* Expense Categories */}
      {data.debitCategories.length > 0 && (
        <DataCard title="Expense Breakdown">
          <div style={{ display: 'grid', gap: '16px' }}>
            {data.debitCategories.map((cat, idx) => (
              <div key={cat.categoryId || idx}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '3px',
                      backgroundColor: categoryColors[(idx + 5) % categoryColors.length],
                    }} />
                    <span style={{
                      fontSize: '14px',
                      fontWeight: '500',
                      color: colors.slate[700],
                    }}>
                      {cat.categoryName}
                    </span>
                    <span style={{
                      fontSize: '12px',
                      color: colors.slate[400],
                      backgroundColor: colors.slate[100],
                      padding: '2px 8px',
                      borderRadius: '12px',
                    }}>
                      {cat.transactionCount} txns
                    </span>
                  </div>
                  <span style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: colors.danger,
                  }}>
                    {formatCurrency(cat.totalAmount)}
                  </span>
                </div>
                <ProgressBar
                  value={cat.percentageOfTotal}
                  color={categoryColors[(idx + 5) % categoryColors.length]}
                  showPercentage={false}
                />
              </div>
            ))}
          </div>
        </DataCard>
      )}

      {/* Monthly Trend */}
      {data.monthlyTrend.length > 0 && (
        <DataCard title="Monthly Trend">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={modernTableHeader}>Period</th>
                  <th style={{ ...modernTableHeader, textAlign: 'right' }}>Income</th>
                  <th style={{ ...modernTableHeader, textAlign: 'right' }}>Expenses</th>
                  <th style={{ ...modernTableHeader, textAlign: 'right' }}>Net</th>
                </tr>
              </thead>
              <tbody>
                {data.monthlyTrend.map((month, idx) => (
                  <tr key={month.month} style={{
                    backgroundColor: idx % 2 === 0 ? '#fff' : colors.slate[50],
                  }}>
                    <td style={modernTableCell}>{formatMonthYear(month.month)}</td>
                    <td style={{ ...modernTableCell, textAlign: 'right', color: colors.success }}>
                      {formatCurrency(month.credits)}
                    </td>
                    <td style={{ ...modernTableCell, textAlign: 'right', color: colors.danger }}>
                      {formatCurrency(month.debits)}
                    </td>
                    <td style={{
                      ...modernTableCell,
                      textAlign: 'right',
                      fontWeight: '600',
                      color: month.net >= 0 ? colors.success : colors.danger,
                    }}>
                      {formatCurrency(month.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataCard>
      )}
    </>
  );
}

// ============================================================
// Collection Report Template
// ============================================================

function CollectionReportModern({ data }: { data: CollectionReportData }) {
  return (
    <>
      {/* Summary Cards */}
      <div style={{
        display: 'flex',
        gap: '16px',
        flexWrap: 'wrap',
        marginBottom: '32px',
      }}>
        <StatCard
          label="Total Invoiced"
          value={formatCurrency(data.summary.totalInvoiced)}
          subValue={`${data.summary.totalResidents} residents`}
          color="primary"
        />
        <StatCard
          label="Total Collected"
          value={formatCurrency(data.summary.totalCollected)}
          color="success"
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(data.summary.totalOutstanding)}
          subValue={`${data.summary.residentsWithDebts} with debts`}
          color="danger"
        />
      </div>

      {/* Collection Rate */}
      <DataCard title="Collection Performance">
        <div style={{ maxWidth: '400px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '12px',
          }}>
            <span style={{
              fontSize: '14px',
              color: colors.slate[600],
            }}>
              Collection Rate
            </span>
            <span style={{
              fontSize: '32px',
              fontWeight: '700',
              color: data.summary.collectionRate >= 80 ? colors.success :
                data.summary.collectionRate >= 50 ? colors.warning : colors.danger,
            }}>
              {data.summary.collectionRate.toFixed(1)}%
            </span>
          </div>
          <ProgressBar
            value={data.summary.collectionRate}
            color={data.summary.collectionRate >= 80 ? colors.success :
              data.summary.collectionRate >= 50 ? colors.warning : colors.danger}
            showPercentage={false}
          />
        </div>
      </DataCard>

      {/* Outstanding by Resident */}
      <DataCard title="Outstanding Balances">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={modernTableHeader}>Resident</th>
                <th style={modernTableHeader}>Property</th>
                <th style={{ ...modernTableHeader, textAlign: 'right' }}>Invoiced</th>
                <th style={{ ...modernTableHeader, textAlign: 'right' }}>Paid</th>
                <th style={{ ...modernTableHeader, textAlign: 'right' }}>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {data.byResident.filter(r => r.outstanding > 0).map((resident, idx) => (
                <tr key={resident.residentId} style={{
                  backgroundColor: idx % 2 === 0 ? '#fff' : colors.slate[50],
                }}>
                  <td style={modernTableCell}>
                    <div style={{ fontWeight: '500' }}>{resident.residentName}</div>
                    <div style={{ fontSize: '12px', color: colors.slate[400] }}>{resident.residentCode}</div>
                  </td>
                  <td style={modernTableCell}>
                    <div>{resident.houseNumber}</div>
                    <div style={{ fontSize: '12px', color: colors.slate[400] }}>{resident.streetName}</div>
                  </td>
                  <td style={{ ...modernTableCell, textAlign: 'right' }}>
                    {formatCurrency(resident.totalInvoiced)}
                  </td>
                  <td style={{ ...modernTableCell, textAlign: 'right', color: colors.success }}>
                    {formatCurrency(resident.totalPaid)}
                  </td>
                  <td style={{ ...modernTableCell, textAlign: 'right', color: colors.danger, fontWeight: '600' }}>
                    {formatCurrency(resident.outstanding)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataCard>
    </>
  );
}

// ============================================================
// Invoice Aging Template
// ============================================================

function InvoiceAgingModern({ data }: { data: InvoiceAgingData }) {
  const bracketColors = [
    { bg: colors.success, label: 'Current' },
    { bg: colors.warning, label: '31-60 Days' },
    { bg: '#f97316', label: '61-90 Days' },
    { bg: colors.danger, label: 'Over 90 Days' },
  ];

  return (
    <>
      {/* Summary Cards */}
      <div style={{
        display: 'flex',
        gap: '16px',
        flexWrap: 'wrap',
        marginBottom: '32px',
      }}>
        <StatCard
          label="Current (0-30 days)"
          value={formatCurrency(data.summary.current)}
          color="success"
        />
        <StatCard
          label="31-60 Days"
          value={formatCurrency(data.summary.days30to60)}
          color="warning"
        />
        <StatCard
          label="Over 90 Days"
          value={formatCurrency(data.summary.over90Days)}
          color="danger"
        />
      </div>

      {/* Aging Distribution */}
      <DataCard title="Aging Distribution">
        <div style={{ display: 'grid', gap: '16px', maxWidth: '500px' }}>
          {data.byBracket.map((bracket, idx) => (
            <div key={bracket.bracket}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '3px',
                    backgroundColor: bracketColors[idx]?.bg || colors.slate[400],
                  }} />
                  <span style={{
                    fontSize: '14px',
                    fontWeight: '500',
                    color: colors.slate[700],
                  }}>
                    {bracket.bracket}
                  </span>
                  <span style={{
                    fontSize: '12px',
                    color: colors.slate[400],
                    backgroundColor: colors.slate[100],
                    padding: '2px 8px',
                    borderRadius: '12px',
                  }}>
                    {bracket.invoiceCount} invoices
                  </span>
                </div>
                <span style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: colors.slate[700],
                }}>
                  {formatCurrency(bracket.totalAmount)}
                </span>
              </div>
              <ProgressBar
                value={bracket.percentage}
                color={bracketColors[idx]?.bg || colors.slate[400]}
                showPercentage={false}
              />
            </div>
          ))}
        </div>
      </DataCard>

      {/* Invoice Details by Bracket */}
      {data.byBracket.map((bracket, bracketIdx) => (
        bracket.invoices.length > 0 && (
          <DataCard
            key={bracket.bracket}
            title={`${bracket.bracket}`}
            headerAction={
              <span style={{
                fontSize: '12px',
                fontWeight: '600',
                color: bracketColors[bracketIdx]?.bg || colors.slate[600],
                backgroundColor: `${bracketColors[bracketIdx]?.bg || colors.slate[400]}20`,
                padding: '4px 12px',
                borderRadius: '12px',
              }}>
                {formatCurrency(bracket.totalAmount)}
              </span>
            }
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={modernTableHeader}>Invoice #</th>
                    <th style={modernTableHeader}>Resident</th>
                    <th style={modernTableHeader}>House</th>
                    <th style={{ ...modernTableHeader, textAlign: 'right' }}>Due Date</th>
                    <th style={{ ...modernTableHeader, textAlign: 'right' }}>Days</th>
                    <th style={{ ...modernTableHeader, textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {bracket.invoices.map((inv, idx) => (
                    <tr key={inv.invoiceId} style={{
                      backgroundColor: idx % 2 === 0 ? '#fff' : colors.slate[50],
                    }}>
                      <td style={{ ...modernTableCell, fontFamily: 'monospace', fontSize: '13px' }}>
                        {inv.invoiceNumber}
                      </td>
                      <td style={modernTableCell}>{inv.residentName}</td>
                      <td style={modernTableCell}>{inv.houseNumber}</td>
                      <td style={{ ...modernTableCell, textAlign: 'right' }}>{formatDate(inv.dueDate)}</td>
                      <td style={{
                        ...modernTableCell,
                        textAlign: 'right',
                        color: inv.daysOverdue > 60 ? colors.danger : colors.slate[600],
                        fontWeight: inv.daysOverdue > 60 ? '600' : '400',
                      }}>
                        {inv.daysOverdue}
                      </td>
                      <td style={{
                        ...modernTableCell,
                        textAlign: 'right',
                        fontWeight: '600',
                        color: colors.danger,
                      }}>
                        {formatCurrency(inv.outstanding)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DataCard>
        )
      ))}
    </>
  );
}

// ============================================================
// Transaction Log Template
// ============================================================

function TransactionLogModern({ data }: { data: TransactionLogData }) {
  return (
    <>
      {/* Summary Cards */}
      <div style={{
        display: 'flex',
        gap: '16px',
        flexWrap: 'wrap',
        marginBottom: '32px',
      }}>
        <StatCard
          label="Total Transactions"
          value={data.summary.totalTransactions.toLocaleString()}
          subValue={`${formatDate(data.summary.dateRange.start)} - ${formatDate(data.summary.dateRange.end)}`}
          color="primary"
        />
        <StatCard
          label="Total Credits"
          value={formatCurrency(data.summary.totalCredits)}
          color="success"
        />
        <StatCard
          label="Total Debits"
          value={formatCurrency(data.summary.totalDebits)}
          color="danger"
        />
      </div>

      {/* Transaction List */}
      <DataCard title="Transaction Details">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={modernTableHeader}>Date</th>
                <th style={modernTableHeader}>Description</th>
                <th style={modernTableHeader}>Category</th>
                <th style={{ ...modernTableHeader, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((txn, idx) => (
                <tr key={txn.id} style={{
                  backgroundColor: idx % 2 === 0 ? '#fff' : colors.slate[50],
                }}>
                  <td style={{ ...modernTableCell, whiteSpace: 'nowrap', fontSize: '13px' }}>
                    {formatDate(txn.date)}
                  </td>
                  <td style={modernTableCell}>
                    <div style={{ fontWeight: '500' }}>{txn.description}</div>
                    {txn.reference && (
                      <div style={{
                        fontSize: '12px',
                        color: colors.slate[400],
                        fontFamily: 'monospace',
                      }}>
                        Ref: {txn.reference}
                      </div>
                    )}
                  </td>
                  <td style={modernTableCell}>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: '500',
                      backgroundColor: colors.slate[100],
                      padding: '4px 10px',
                      borderRadius: '12px',
                      color: colors.slate[600],
                    }}>
                      {txn.category}
                    </span>
                  </td>
                  <td style={{
                    ...modernTableCell,
                    textAlign: 'right',
                    fontWeight: '600',
                    fontFamily: 'monospace',
                    color: txn.type === 'credit' ? colors.success : colors.danger,
                  }}>
                    {txn.type === 'credit' ? '+' : '-'}{formatCurrency(txn.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataCard>
    </>
  );
}

// ============================================================
// Debtors Report Template
// ============================================================

function DebtorsReportModern({ data }: { data: DebtorsReportData }) {
  const bracketColors = [
    { bg: colors.success, label: 'Current' },
    { bg: colors.warning, label: '31-60 Days' },
    { bg: '#f97316', label: '61-90 Days' },
    { bg: colors.danger, label: 'Over 90 Days' },
  ];

  return (
    <>
      {/* Summary Cards */}
      <div style={{
        display: 'flex',
        gap: '16px',
        flexWrap: 'wrap',
        marginBottom: '32px',
      }}>
        <StatCard
          label="Total Debtors"
          value={data.summary.totalDebtors.toString()}
          subValue={`Avg: ${formatCurrency(data.summary.averageDebt)}`}
          color="primary"
        />
        <StatCard
          label="Total Outstanding"
          value={formatCurrency(data.summary.totalOutstanding)}
          color="danger"
        />
        <StatCard
          label="Over 90 Days"
          value={formatCurrency(data.summary.over90Days)}
          subValue={`${((data.summary.over90Days / data.summary.totalOutstanding) * 100 || 0).toFixed(1)}% of total`}
          color="danger"
        />
        <StatCard
          label="Avg Days Overdue"
          value={Math.round(data.summary.averageDaysOverdue).toString()}
          subValue="days"
          color="warning"
        />
      </div>

      {/* Aging Distribution */}
      <DataCard title="Aging Distribution">
        <div style={{ display: 'grid', gap: '16px', maxWidth: '500px' }}>
          {data.byAgingBracket.map((bracket, idx) => (
            <div key={bracket.bracket}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '3px',
                    backgroundColor: bracketColors[idx]?.bg || colors.slate[400],
                  }} />
                  <span style={{
                    fontSize: '14px',
                    fontWeight: '500',
                    color: colors.slate[700],
                  }}>
                    {bracket.bracket}
                  </span>
                  <span style={{
                    fontSize: '12px',
                    color: colors.slate[400],
                    backgroundColor: colors.slate[100],
                    padding: '2px 8px',
                    borderRadius: '12px',
                  }}>
                    {bracket.debtorCount} debtors
                  </span>
                </div>
                <span style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: colors.slate[700],
                }}>
                  {formatCurrency(bracket.totalAmount)}
                </span>
              </div>
              <ProgressBar
                value={bracket.percentage}
                color={bracketColors[idx]?.bg || colors.slate[400]}
                showPercentage={false}
              />
            </div>
          ))}
        </div>
      </DataCard>

      {/* Detailed Debtors List */}
      <DataCard
        title="Debtors List (For Follow-up)"
        headerAction={
          <span style={{
            fontSize: '12px',
            fontWeight: '500',
            color: colors.slate[500],
          }}>
            Sorted by outstanding amount
          </span>
        }
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={modernTableHeader}>Debtor</th>
                <th style={modernTableHeader}>Contact</th>
                <th style={modernTableHeader}>Property</th>
                <th style={{ ...modernTableHeader, textAlign: 'center' }}>Invoices</th>
                <th style={{ ...modernTableHeader, textAlign: 'right' }}>Days</th>
                <th style={{ ...modernTableHeader, textAlign: 'right' }}>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {data.debtors.map((debtor, idx) => (
                <tr key={debtor.residentId} style={{
                  backgroundColor: idx % 2 === 0 ? '#fff' : colors.slate[50],
                }}>
                  <td style={modernTableCell}>
                    <div style={{ fontWeight: '500' }}>{debtor.residentName}</div>
                    <div style={{ fontSize: '12px', color: colors.slate[400] }}>{debtor.residentCode}</div>
                  </td>
                  <td style={modernTableCell}>
                    {debtor.phonePrimary && (
                      <div style={{ fontSize: '13px' }}>
                        <span style={{ marginRight: '4px' }}>📞</span>
                        {debtor.phonePrimary}
                      </div>
                    )}
                    {debtor.phoneSecondary && (
                      <div style={{ fontSize: '12px', color: colors.slate[500] }}>
                        <span style={{ marginRight: '4px' }}>📱</span>
                        {debtor.phoneSecondary}
                      </div>
                    )}
                    {debtor.email && (
                      <div style={{ fontSize: '12px', color: colors.slate[500] }}>
                        <span style={{ marginRight: '4px' }}>✉️</span>
                        {debtor.email}
                      </div>
                    )}
                    {!debtor.phonePrimary && !debtor.email && (
                      <span style={{ fontSize: '12px', color: colors.slate[400], fontStyle: 'italic' }}>
                        No contact info
                      </span>
                    )}
                  </td>
                  <td style={modernTableCell}>
                    <div>{debtor.houseNumber}</div>
                    <div style={{ fontSize: '12px', color: colors.slate[400] }}>{debtor.streetName}</div>
                  </td>
                  <td style={{ ...modernTableCell, textAlign: 'center' }}>
                    <span style={{
                      fontSize: '13px',
                      fontWeight: '500',
                      backgroundColor: colors.slate[100],
                      padding: '4px 10px',
                      borderRadius: '12px',
                    }}>
                      {debtor.invoiceCount}
                    </span>
                  </td>
                  <td style={{
                    ...modernTableCell,
                    textAlign: 'right',
                    color: debtor.daysOverdue > 90 ? colors.danger :
                      debtor.daysOverdue > 60 ? '#f97316' :
                        debtor.daysOverdue > 30 ? colors.warning : colors.slate[600],
                    fontWeight: debtor.daysOverdue > 60 ? '600' : '400',
                  }}>
                    {debtor.daysOverdue}
                  </td>
                  <td style={{
                    ...modernTableCell,
                    textAlign: 'right',
                  }}>
                    <div style={{
                      fontWeight: '600',
                      color: colors.danger,
                      fontSize: '14px',
                    }}>
                      {formatCurrency(debtor.totalOutstanding)}
                    </div>
                    {/* Mini aging breakdown */}
                    <div style={{
                      display: 'flex',
                      gap: '4px',
                      justifyContent: 'flex-end',
                      marginTop: '4px',
                    }}>
                      {debtor.current > 0 && (
                        <span style={{
                          fontSize: '10px',
                          backgroundColor: `${colors.success}20`,
                          color: colors.success,
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}>
                          0-30: {formatCurrency(debtor.current)}
                        </span>
                      )}
                      {debtor.days31to60 > 0 && (
                        <span style={{
                          fontSize: '10px',
                          backgroundColor: `${colors.warning}20`,
                          color: colors.warning,
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}>
                          31-60: {formatCurrency(debtor.days31to60)}
                        </span>
                      )}
                      {debtor.days61to90 > 0 && (
                        <span style={{
                          fontSize: '10px',
                          backgroundColor: '#f9731620',
                          color: '#f97316',
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}>
                          61-90: {formatCurrency(debtor.days61to90)}
                        </span>
                      )}
                      {debtor.over90Days > 0 && (
                        <span style={{
                          fontSize: '10px',
                          backgroundColor: `${colors.danger}20`,
                          color: colors.danger,
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}>
                          90+: {formatCurrency(debtor.over90Days)}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: colors.slate[100] }}>
                <td style={{ ...modernTableCell, fontWeight: '600' }} colSpan={3}>
                  TOTAL ({data.summary.totalDebtors} debtors)
                </td>
                <td style={{ ...modernTableCell, textAlign: 'center', fontWeight: '600' }}>
                  {data.debtors.reduce((sum, d) => sum + d.invoiceCount, 0)}
                </td>
                <td style={{ ...modernTableCell, textAlign: 'right', fontWeight: '600' }}>
                  {Math.round(data.summary.averageDaysOverdue)}
                </td>
                <td style={{ ...modernTableCell, textAlign: 'right', fontWeight: '700', color: colors.danger }}>
                  {formatCurrency(data.summary.totalOutstanding)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </DataCard>
    </>
  );
}

// ============================================================
// Indebtedness Summary Template
// ============================================================

function IndebtednessSummaryModern({ data }: { data: IndebtednessSummaryData }) {
  return (
    <>
      {/* Summary Cards */}
      <div style={{
        display: 'flex',
        gap: '16px',
        flexWrap: 'wrap',
        marginBottom: '32px',
      }}>
        <StatCard
          label="Total Houses"
          value={data.summary.totalHouses.toString()}
          color="primary"
        />
        <StatCard
          label="Indebted"
          value={data.summary.indebtedCount.toString()}
          subValue={`${((data.summary.indebtedCount / data.summary.totalHouses) * 100 || 0).toFixed(1)}% of total`}
          color="danger"
        />
        <StatCard
          label="Non-Indebted"
          value={data.summary.nonIndebtedCount.toString()}
          subValue={`${((data.summary.nonIndebtedCount / data.summary.totalHouses) * 100 || 0).toFixed(1)}% of total`}
          color="success"
        />
      </div>

      {/* Indebtedness Table */}
      <DataCard title="Indebtedness Status by House">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={modernTableHeader}>Street</th>
                <th style={modernTableHeader}>House #</th>
                <th style={modernTableHeader}>Primary Resident</th>
                <th style={{ ...modernTableHeader, textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.houses.map((house, idx) => (
                <tr key={house.houseId} style={{
                  backgroundColor: idx % 2 === 0 ? '#fff' : colors.slate[50],
                }}>
                  <td style={modernTableCell}>{house.streetName}</td>
                  <td style={{ ...modernTableCell, fontWeight: '500' }}>{house.houseNumber}</td>
                  <td style={modernTableCell}>{house.primaryResidentName}</td>
                  <td style={{ ...modernTableCell, textAlign: 'center' }}>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: '600',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      backgroundColor: house.isIndebted ? `${colors.danger}15` : `${colors.success}15`,
                      color: house.isIndebted ? colors.danger : colors.success,
                    }}>
                      {house.isIndebted ? 'Indebted' : 'Non-Indebted'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataCard>
    </>
  );
}

// ============================================================
// Indebtedness Detail Template
// ============================================================

function IndebtednessDetailModern({ data }: { data: IndebtednessDetailData }) {
  return (
    <>
      {/* Summary Cards */}
      <div style={{
        display: 'flex',
        gap: '16px',
        flexWrap: 'wrap',
        marginBottom: '32px',
      }}>
        <StatCard
          label="Total Houses"
          value={data.summary.totalHouses.toString()}
          color="primary"
        />
        <StatCard
          label="Indebted"
          value={data.summary.indebtedCount.toString()}
          subValue={`${((data.summary.indebtedCount / data.summary.totalHouses) * 100 || 0).toFixed(1)}% of total`}
          color="danger"
        />
        <StatCard
          label="Total Outstanding"
          value={formatCurrency(data.summary.totalOutstanding)}
          color="danger"
        />
        <StatCard
          label="Non-Indebted"
          value={data.summary.nonIndebtedCount.toString()}
          color="success"
        />
      </div>

      {/* Indebtedness Detail Table */}
      <DataCard title="Indebtedness Details by House">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={modernTableHeader}>Street</th>
                <th style={modernTableHeader}>House #</th>
                <th style={modernTableHeader}>Primary Resident</th>
                <th style={{ ...modernTableHeader, textAlign: 'center' }}>Status</th>
                <th style={{ ...modernTableHeader, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.houses.map((house, idx) => (
                <tr key={house.houseId} style={{
                  backgroundColor: idx % 2 === 0 ? '#fff' : colors.slate[50],
                }}>
                  <td style={modernTableCell}>{house.streetName}</td>
                  <td style={{ ...modernTableCell, fontWeight: '500' }}>{house.houseNumber}</td>
                  <td style={modernTableCell}>{house.primaryResidentName}</td>
                  <td style={{ ...modernTableCell, textAlign: 'center' }}>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: '600',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      backgroundColor: house.isIndebted ? `${colors.danger}15` : `${colors.success}15`,
                      color: house.isIndebted ? colors.danger : colors.success,
                    }}>
                      {house.isIndebted ? 'Indebted' : 'Non-Indebted'}
                    </span>
                  </td>
                  <td style={{
                    ...modernTableCell,
                    textAlign: 'right',
                    fontWeight: house.outstandingAmount > 0 ? '600' : '400',
                    color: house.outstandingAmount > 0 ? colors.danger : colors.slate[600],
                  }}>
                    {formatCurrency(house.outstandingAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: colors.slate[100] }}>
                <td style={{ ...modernTableCell, fontWeight: '600' }} colSpan={4}>
                  TOTAL
                </td>
                <td style={{ ...modernTableCell, textAlign: 'right', fontWeight: '700', color: colors.danger }}>
                  {formatCurrency(data.summary.totalOutstanding)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </DataCard>
    </>
  );
}

// ============================================================
// Development Levy Template
// ============================================================

function DevelopmentLevyModern({ data }: { data: DevelopmentLevyData }) {
  return (
    <>
      {/* Summary Cards */}
      <div style={{
        display: 'flex',
        gap: '16px',
        flexWrap: 'wrap',
        marginBottom: '32px',
      }}>
        <StatCard
          label="Total Properties"
          value={data.summary.totalHouses.toString()}
          color="primary"
        />
        <StatCard
          label="Paid"
          value={data.summary.paidCount.toString()}
          subValue={formatCurrency(data.summary.collectedAmount)}
          color="success"
        />
        <StatCard
          label="Unpaid"
          value={data.summary.unpaidCount.toString()}
          subValue={formatCurrency(data.summary.totalAmount - data.summary.collectedAmount)}
          color="danger"
        />
        <StatCard
          label="Collection Rate"
          value={`${data.summary.collectionRate.toFixed(1)}%`}
          color={data.summary.collectionRate >= 80 ? 'success' :
            data.summary.collectionRate >= 50 ? 'warning' : 'danger'}
        />
      </div>

      {/* Collection Progress */}
      <DataCard title="Collection Progress">
        <div style={{ maxWidth: '400px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '12px',
          }}>
            <span style={{ fontSize: '14px', color: colors.slate[600] }}>
              {formatCurrency(data.summary.collectedAmount)} of {formatCurrency(data.summary.totalAmount)}
            </span>
            <span style={{
              fontSize: '24px',
              fontWeight: '700',
              color: data.summary.collectionRate >= 80 ? colors.success :
                data.summary.collectionRate >= 50 ? colors.warning : colors.danger,
            }}>
              {data.summary.collectionRate.toFixed(1)}%
            </span>
          </div>
          <ProgressBar
            value={data.summary.collectionRate}
            color={data.summary.collectionRate >= 80 ? colors.success :
              data.summary.collectionRate >= 50 ? colors.warning : colors.danger}
            showPercentage={false}
          />
        </div>
      </DataCard>

      {/* Development Levy Table */}
      <DataCard title="Development Levy Status by Property">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={modernTableHeader}>House</th>
                <th style={modernTableHeader}>Primary Resident</th>
                <th style={modernTableHeader}>Responsible Party</th>
                <th style={{ ...modernTableHeader, textAlign: 'right' }}>Levy Amount</th>
                <th style={{ ...modernTableHeader, textAlign: 'center' }}>Paid</th>
              </tr>
            </thead>
            <tbody>
              {data.houses.map((house, idx) => (
                <tr key={house.houseId} style={{
                  backgroundColor: idx % 2 === 0 ? '#fff' : colors.slate[50],
                }}>
                  <td style={modernTableCell}>
                    <div style={{ fontWeight: '500' }}>{house.houseNumber}</div>
                    <div style={{ fontSize: '12px', color: colors.slate[400] }}>{house.streetName}</div>
                  </td>
                  <td style={modernTableCell}>{house.responsibleResidentName}</td>
                  <td style={modernTableCell}>
                    <span style={{
                      fontSize: '12px',
                      backgroundColor: colors.slate[100],
                      padding: '4px 8px',
                      borderRadius: '8px',
                      color: colors.slate[600],
                    }}>
                      {house.responsibleResidentRole}
                    </span>
                  </td>
                  <td style={{ ...modernTableCell, textAlign: 'right', fontWeight: '500' }}>
                    {formatCurrency(house.levyAmount)}
                  </td>
                  <td style={{ ...modernTableCell, textAlign: 'center' }}>
                    <span style={{
                      fontSize: '16px',
                    }}>
                      {house.isPaid ? '✓' : '✗'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: colors.slate[100] }}>
                <td style={{ ...modernTableCell, fontWeight: '600' }} colSpan={3}>
                  TOTAL ({data.summary.paidCount} paid, {data.summary.unpaidCount} unpaid)
                </td>
                <td style={{ ...modernTableCell, textAlign: 'right', fontWeight: '700' }}>
                  {formatCurrency(data.summary.totalAmount)}
                </td>
                <td style={{ ...modernTableCell, textAlign: 'center', fontWeight: '600' }}>
                  {data.summary.collectionRate.toFixed(0)}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </DataCard>
    </>
  );
}

// ============================================================
// Shared Styles
// ============================================================

const modernTableHeader: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: '600',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: colors.slate[500],
  borderBottom: `2px solid ${colors.slate[200]}`,
  backgroundColor: colors.slate[50],
};

const modernTableCell: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: '14px',
  color: colors.slate[700],
  borderBottom: `1px solid ${colors.slate[100]}`,
};

// ============================================================
// Main Modern Template Component
// ============================================================

interface ModernTemplateProps {
  report: ReportData;
  title: string;
  dateRange?: { start: string; end: string };
  estateName?: string;
}

export const ModernTemplate = forwardRef<HTMLDivElement, ModernTemplateProps>(
  function ModernTemplate({ report, title, dateRange, estateName = 'Residio Estate' }, ref) {
    const generatedDate = new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <div
        ref={ref}
        style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          maxWidth: '1000px',
          margin: '0 auto',
          padding: '40px',
          backgroundColor: colors.slate[50],
          color: colors.slate[800],
          lineHeight: 1.5,
          minHeight: '100vh',
        }}
      >
        {/* Header */}
        <header style={{ marginBottom: '40px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '24px',
          }}>
            <div>
              <div style={{
                fontSize: '12px',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: colors.primary,
                marginBottom: '8px',
              }}>
                {estateName}
              </div>
              <h1 style={{
                fontSize: '28px',
                fontWeight: '700',
                color: colors.slate[900],
                margin: 0,
                letterSpacing: '-0.5px',
              }}>
                {title}
              </h1>
            </div>
            <div style={{
              textAlign: 'right',
              fontSize: '13px',
              color: colors.slate[500],
            }}>
              {dateRange && (
                <div style={{ marginBottom: '4px' }}>
                  {formatDate(dateRange.start)} — {formatDate(dateRange.end)}
                </div>
              )}
              <div>Generated: {generatedDate}</div>
            </div>
          </div>
          <div style={{
            height: '4px',
            background: `linear-gradient(90deg, ${colors.primary} 0%, ${colors.primaryDark} 50%, ${colors.success} 100%)`,
            borderRadius: '2px',
          }} />
        </header>

        {/* Report Content */}
        <main>
          {report.type === 'financial_overview' && (
            <FinancialOverviewModern data={report.data} />
          )}
          {report.type === 'collection_report' && (
            <CollectionReportModern data={report.data} />
          )}
          {report.type === 'invoice_aging' && (
            <InvoiceAgingModern data={report.data} />
          )}
          {report.type === 'transaction_log' && (
            <TransactionLogModern data={report.data} />
          )}
          {report.type === 'debtors_report' && (
            <DebtorsReportModern data={report.data} />
          )}
          {report.type === 'indebtedness_summary' && (
            <IndebtednessSummaryModern data={report.data} />
          )}
          {report.type === 'indebtedness_detail' && (
            <IndebtednessDetailModern data={report.data} />
          )}
          {report.type === 'development_levy' && (
            <DevelopmentLevyModern data={report.data} />
          )}
        </main>

        {/* Footer */}
        <footer style={{
          marginTop: '48px',
          paddingTop: '24px',
          borderTop: `1px solid ${colors.slate[200]}`,
          textAlign: 'center',
          fontSize: '12px',
          color: colors.slate[400],
        }}>
          <div style={{ marginBottom: '8px' }}>
            This report was automatically generated by {estateName} Financial Management System
          </div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: colors.slate[100],
            padding: '6px 16px',
            borderRadius: '20px',
          }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: colors.success,
            }} />
            <span>Data verified</span>
          </div>
        </footer>
      </div>
    );
  }
);
