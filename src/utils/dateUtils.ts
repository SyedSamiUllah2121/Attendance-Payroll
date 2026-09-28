/**
 * Local-date helpers. Always build YYYY-MM-DD from local date parts:
 * toISOString() is UTC and shifts the day in UTC+5.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD for a Date, in local time. */
export const toDateStr = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Today's date as YYYY-MM-DD. */
export const todayStr = (): string => toDateStr(new Date());

/** The current month as YYYY-MM. */
export const currentMonthStr = (): string => todayStr().slice(0, 7);

/** Parse YYYY-MM-DD as a local-midnight Date. */
export const parseDateStr = (dateStr: string): Date => new Date(dateStr + 'T00:00:00');

/** YYYY-MM-DD shifted by a number of days. */
export const addDaysStr = (dateStr: string, days: number): string => {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
};

/** First day of the month containing dateStr. */
export const monthStartStr = (dateStr: string): string => `${dateStr.slice(0, 7)}-01`;

/** Last day of a YYYY-MM month. */
export const monthEndStr = (month: string): string => {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${pad(new Date(y, m, 0).getDate())}`;
};

/** The month before a YYYY-MM month. */
export const prevMonthStr = (month: string): string => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
