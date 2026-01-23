export const POLLING_INTERVALS = {
    FAST: 5000,      // 5 seconds - for transaction polling/status checks
    REALTIME: 30000, // 30 seconds - for highly active data (e.g. notifications, real-time counters)
    STANDARD: 60000, // 1 minute - default for most dashboard data
    SLOW: 180000,    // 3 minutes - for heavy queries or semi-static data
    BACKGROUND: 300000, // 5 minutes - for non-critical background updates
} as const;

export type PollingInterval = keyof typeof POLLING_INTERVALS;
