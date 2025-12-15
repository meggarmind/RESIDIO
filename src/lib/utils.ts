import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  }).format(amount);
}

// Format date as dd/mm/yyyy
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-GB'); // Returns dd/mm/yyyy
}

// Format date and time as dd/MM/yyyy hh:mmtt (12-hour format)
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 should be 12
  return `${day}/${month}/${year} ${hours.toString().padStart(2, '0')}:${minutes}${ampm}`;
}

// Format validity period as "Valid from X to Y"
export function formatValidityPeriod(from: Date | string, until: Date | string | null): string {
  const fromFormatted = formatDateTime(from);
  if (!until) return `Valid from ${fromFormatted}`;
  const untilFormatted = formatDateTime(until);
  return `Valid from ${fromFormatted} to ${untilFormatted}`;
}

// Get smart relative time display (months/days/hours/minutes)
export function getRelativeTimeDisplay(futureDate: Date | string): string {
  const now = new Date();
  const target = typeof futureDate === 'string' ? new Date(futureDate) : futureDate;
  const diffMs = target.getTime() - now.getTime();

  if (diffMs < 0) return 'Expired';

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMonths > 0) return `${diffMonths}mo`;
  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  if (diffMinutes > 0) return `${diffMinutes}m`;
  return '<1m';
}
