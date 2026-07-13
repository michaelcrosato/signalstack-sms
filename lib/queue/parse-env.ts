/**
 * Parse a positive-integer environment value, falling back to `fallback` when the value is missing,
 * non-numeric, zero, or negative. Guards BullMQ tuning knobs so a mistyped value cannot silently become
 * `NaN` (which would, for example, disable worker lock renewal / stalled-job detection) or a
 * non-positive interval.
 */
export function positiveIntFromEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
