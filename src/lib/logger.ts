/**
 * Lightweight logger utility for conditional logging
 *
 * In production, only error-level logs are output.
 * In development, all log levels are output.
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info('[Module]', 'Message', data);
 *   logger.warn('[Module]', 'Warning message');
 *   logger.error('[Module]', 'Error message', error);
 */

const isDev = process.env.NODE_ENV !== 'production';

export const logger = {
  /**
   * Debug-level logging - only in development
   */
  debug: (...args: unknown[]) => {
    if (isDev) {
      console.log(...args);
    }
  },

  /**
   * Info-level logging - only in development
   * Use for operational messages like "[Billing] Processing invoice..."
   */
  info: (...args: unknown[]) => {
    if (isDev) {
      console.log(...args);
    }
  },

  /**
   * Warning-level logging - always output
   */
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },

  /**
   * Error-level logging - always output
   */
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};

/**
 * Create a scoped logger with a prefix
 *
 * Usage:
 *   const log = createLogger('[Billing]');
 *   log.info('Processing invoice...');
 *   log.error('Failed:', error);
 */
export function createLogger(prefix: string) {
  return {
    debug: (...args: unknown[]) => logger.debug(prefix, ...args),
    info: (...args: unknown[]) => logger.info(prefix, ...args),
    warn: (...args: unknown[]) => logger.warn(prefix, ...args),
    error: (...args: unknown[]) => logger.error(prefix, ...args),
  };
}
