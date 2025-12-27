/**
 * Analytics Types
 *
 * TypeScript interfaces for the analytics dashboard.
 * Used by server actions, hooks, and chart components.
 */

/**
 * Time series data point for trend charts
 */
export interface TimeSeriesDataPoint {
  /** Date in format "2025-01" or ISO date string */
  date: string;
  /** Human-readable label like "Jan '25" */
  label: string;
  /** Primary value (e.g., revenue) */
  value: number;
  /** Optional secondary value (e.g., expenses) */
  secondaryValue?: number;
}

/**
 * Category breakdown data for pie/bar charts
 */
export interface CategoryData {
  /** Category name (e.g., "bank_transfer", "Monthly Dues") */
  category: string;
  /** Number of items in this category */
  count: number;
  /** Total amount for this category */
  amount: number;
  /** Percentage of total */
  percentage: number;
  /** Optional color for chart rendering */
  color?: string;
}

/**
 * Occupancy metrics
 */
export interface OccupancyData {
  /** Number of occupied houses */
  occupied: number;
  /** Number of vacant houses */
  vacant: number;
  /** Total number of houses */
  total: number;
  /** Occupancy percentage (0-100) */
  percentage: number;
}

/**
 * Payment compliance metrics
 */
export interface PaymentComplianceData {
  /** Number of on-time payments */
  onTime: number;
  /** Number of late payments */
  late: number;
  /** Total payments */
  total: number;
  /** On-time percentage (0-100) */
  percentage: number;
}

/**
 * Key Performance Indicators
 */
export interface KPIData {
  /** Total revenue collected in the period */
  totalRevenue: number;
  /** Total expenses in the period */
  totalExpenses: number;
  /** Net income (revenue - expenses) */
  netIncome: number;
  /** Collection rate percentage (0-100) */
  collectionRate: number;
  /** Occupancy rate percentage (0-100) */
  occupancyRate: number;
  /** Average days to payment */
  avgDaysToPayment?: number;
}

/**
 * Complete analytics data returned by server action
 */
export interface AnalyticsData {
  /** Revenue trend over time (typically 12 months) */
  revenueTrend: TimeSeriesDataPoint[];
  /** Collection rate trend over time */
  collectionRateTrend: TimeSeriesDataPoint[];
  /** Payment method distribution */
  paymentMethods: CategoryData[];
  /** Invoice category breakdown */
  invoiceCategories: CategoryData[];
  /** Current occupancy metrics */
  currentOccupancy: OccupancyData;
  /** Payment compliance metrics */
  paymentCompliance: PaymentComplianceData;
  /** Key performance indicators */
  kpis: KPIData;
  /** ISO timestamp of when data was fetched */
  lastUpdated: string;
}

/**
 * Date range preset options
 */
export type AnalyticsPreset =
  | 'this_month'
  | 'last_month'
  | 'last_quarter'
  | 'ytd'
  | 'last_year'
  | 'custom';

/**
 * Date range for analytics queries
 */
export interface AnalyticsDateRange {
  /** Start date in ISO format (YYYY-MM-DD) */
  startDate: string;
  /** End date in ISO format (YYYY-MM-DD) */
  endDate: string;
  /** Preset used to generate the range */
  preset: AnalyticsPreset;
}

/**
 * Analytics API response wrapper
 */
export interface AnalyticsResponse {
  data: AnalyticsData | null;
  error: string | null;
}
