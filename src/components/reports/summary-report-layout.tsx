'use client';

import type { CSSProperties } from 'react';
import {
  MAX_SUMMARY_TILES,
  formatSummaryCell,
  type SummaryReportData,
  type SummaryTone,
} from '@/lib/reports/summary-report';

// "Summary first" layout (#1397, mockup option B): tiles and chart on page 1, then the table.
// One renderer for the modern and the traditional template; the styles mirror each template's
// own StatCard/DataCard (modern) and summary box/table (traditional) look.

type Variant = 'modern' | 'traditional';

const slate = { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b' };

const modernTileBg: Record<SummaryTone, string> = {
  good: 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
  bad: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)',
  neutral: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
};
const modernBar: Record<SummaryTone, string> = { good: '#10b981', bad: '#ef4444', neutral: '#6366f1' };
const traditionalTone: Record<SummaryTone, string> = { good: '#006400', bad: '#8B0000', neutral: '#1a1a1a' };

const sectionTitle: Record<Variant, CSSProperties> = {
  modern: { fontSize: '14px', fontWeight: 600, color: slate[800], margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' },
  traditional: { fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #1a1a1a', paddingBottom: '8px', marginBottom: '16px' },
};

function Section({ variant, title, children, style }: { variant: Variant; title: string; children: React.ReactNode; style?: CSSProperties }) {
  if (variant === 'traditional') {
    return (
      <div style={{ marginBottom: '32px', ...style }}>
        <h2 style={sectionTitle.traditional}>{title}</h2>
        {children}
      </div>
    );
  }
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '16px', border: `1px solid ${slate[200]}`, overflow: 'hidden', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', ...style }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${slate[200]}`, background: slate[50] }}>
        <h3 style={sectionTitle.modern}>{title}</h3>
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  );
}

function Tiles({ variant, tiles }: { variant: Variant; tiles: SummaryReportData['summary'] }) {
  if (variant === 'traditional') {
    return (
      <div style={{ marginBottom: '32px' }}>
        <h2 style={sectionTitle.traditional}>Summary</h2>
        <div style={{ border: '1px solid #1a1a1a', padding: '20px' }}>
          {tiles.map((tile, i) => (
            <div key={i} data-testid="summary-tile" style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', padding: '8px 0', borderBottom: i < tiles.length - 1 ? '1px dotted #ccc' : 'none' }}>
              <span>
                {tile.label}
                {tile.hint && <span style={{ display: 'block', fontSize: '11px', color: '#666' }}>{tile.hint}</span>}
              </span>
              <span style={{ fontFamily: "'Courier New', monospace", color: traditionalTone[tile.tone ?? 'neutral'] }}>
                {formatSummaryCell(tile.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
      {tiles.map((tile, i) => (
        <div key={i} data-testid="summary-tile" style={{ background: modernTileBg[tile.tone ?? 'neutral'], borderRadius: '16px', padding: '24px', color: '#fff', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.2)', flex: '1 1 200px', minWidth: '200px' }}>
          <div style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.9, marginBottom: '12px' }}>{tile.label}</div>
          <div style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.5px' }}>{formatSummaryCell(tile.value)}</div>
          {tile.hint && <div style={{ fontSize: '13px', opacity: 0.85, marginTop: '4px' }}>{tile.hint}</div>}
        </div>
      ))}
    </div>
  );
}

function Chart({ variant, chart }: { variant: Variant; chart: NonNullable<SummaryReportData['chart']> }) {
  const max = Math.max(0, ...chart.bars.map((b) => Math.abs(b.value)));
  return (
    <Section variant={variant} title={chart.title}>
      {chart.bars.map((bar, i) => {
        const width = max > 0 ? (Math.abs(bar.value) / max) * 100 : 0;
        const tone = bar.tone ?? 'neutral';
        const fill = variant === 'modern' ? modernBar[tone] : traditionalTone[tone];
        return (
          <div key={i} data-testid="summary-bar" style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px', color: variant === 'modern' ? slate[600] : '#1a1a1a' }}>
              <span>{bar.label}</span>
              <span style={{ fontWeight: 600 }}>{bar.display ?? formatSummaryCell(bar.value)}</span>
            </div>
            <div style={{ height: '8px', backgroundColor: variant === 'modern' ? slate[200] : '#eee', borderRadius: variant === 'modern' ? '4px' : 0, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${width}%`, backgroundColor: fill, borderRadius: variant === 'modern' ? '4px' : 0 }} />
            </div>
          </div>
        );
      })}
    </Section>
  );
}

function Table({ variant, table, style }: { variant: Variant; table: SummaryReportData['table']; style?: CSSProperties }) {
  const th: CSSProperties = variant === 'modern'
    ? { padding: '12px 16px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: slate[500], borderBottom: `2px solid ${slate[200]}`, backgroundColor: slate[50] }
    : { background: '#f5f5f5', border: '1px solid #1a1a1a', padding: '10px 8px', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.5px' };
  const td: CSSProperties = variant === 'modern'
    ? { padding: '12px 16px', fontSize: '14px', color: slate[700], borderBottom: `1px solid ${slate[100]}` }
    : { border: '1px solid #ccc', padding: '8px', verticalAlign: 'top' };

  return (
    <Section variant={variant} title="Details" style={style}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: variant === 'modern' ? '14px' : '12px' }}>
          <thead>
            <tr>
              {table.columns.map((col) => (
                <th key={col.key} style={{ ...th, textAlign: col.align ?? 'left' }}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.length === 0 ? (
              <tr>
                <td colSpan={table.columns.length} style={{ ...td, textAlign: 'center' }}>No rows for this report.</td>
              </tr>
            ) : (
              table.rows.map((row, i) => (
                <tr key={i}>
                  {table.columns.map((col) => (
                    <td key={col.key} style={{ ...td, textAlign: col.align ?? 'left' }}>{formatSummaryCell(row[col.key])}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {table.totals && (
            <tfoot>
              <tr data-testid="summary-totals" style={{ fontWeight: 'bold', backgroundColor: variant === 'modern' ? slate[50] : '#f5f5f5' }}>
                {table.columns.map((col) => (
                  <td key={col.key} style={{ ...td, textAlign: col.align ?? 'left' }}>{formatSummaryCell(table.totals![col.key])}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Section>
  );
}

export function SummaryReportLayout({ data, variant }: { data: SummaryReportData; variant: Variant }) {
  const tiles = data.summary.slice(0, MAX_SUMMARY_TILES);
  const showChart = !!data.chart && data.chart.bars.length > 0;
  const hasFirstPage = tiles.length > 0 || showChart;

  return (
    <div data-testid="summary-report">
      {tiles.length > 0 && <Tiles variant={variant} tiles={tiles} />}
      {showChart && <Chart variant={variant} chart={data.chart!} />}
      {/* Printed, the table starts on page 2 so page 1 holds the summary. */}
      <Table variant={variant} table={data.table} style={hasFirstPage ? { breakBefore: 'page', pageBreakBefore: 'always' } : undefined} />
      {data.notes && data.notes.length > 0 && (
        <ul style={{ fontSize: '12px', color: variant === 'modern' ? slate[500] : '#666', paddingLeft: '20px', margin: 0 }}>
          {data.notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
