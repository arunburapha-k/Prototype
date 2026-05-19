/**
 * Helper to format date for HTML date input (YYYY-MM-DD)
 */
export const formatForInput = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * Calculates a dynamic interval based on the time range duration
 */
export const getDynamicInterval = (startTs: number, endTs: number): number => {
  const durationMs = endTs - startTs;
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const diffDays = durationMs / dayMs;

  if (diffDays > 360) return dayMs;
  if (diffDays > 180) return 12 * hourMs;
  if (diffDays > 90) return 8 * hourMs;
  if (diffDays > 30) return 4 * hourMs;
  if (diffDays > 7) return hourMs;
  if (diffDays > 1) return 30 * minuteMs;
  return 5 * minuteMs;
};

/**
 * Normalizes values to numbers or undefined
 */
export const toOptionalNumber = (val: unknown): number | undefined => {
  if (val === null || val === undefined || val === '') return undefined;
  const num = Number(val);
  return Number.isNaN(num) ? undefined : num;
};
