import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format date to DD/MM/YYYY in IST
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(d.getTime() + istOffset);
  const day = String(istDate.getUTCDate()).padStart(2, '0');
  const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const year = istDate.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Convert date to IST datetime string for datetime-local input (YYYY-MM-DDTHH:MM)
 */
export function toISTDateTimeLocal(date: Date): string {
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(date.getTime() + istOffset);
  return istDate.toISOString().slice(0, 16);
}

/**
 * Convert datetime-local input value (assumed IST) to UTC Date
 */
export function fromISTDateTimeLocal(dateTimeStr: string): Date {
  if (!dateTimeStr) return new Date();
  // Parse the input as IST and convert to UTC
  const istOffset = 5.5 * 60 * 60 * 1000;
  const localDate = new Date(dateTimeStr);
  return new Date(localDate.getTime() - istOffset);
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
