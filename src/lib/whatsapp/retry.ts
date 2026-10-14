/**
 * Whether an HTTP status from a WhatsApp provider is worth retrying (#546):
 * 5xx, 429 and 408 are transient; every other 4xx (and any non-error status)
 * is a request the provider will keep rejecting.
 */
export function isRetryableHttpStatus(status: number): boolean {
  return status >= 500 || status === 429 || status === 408;
}
