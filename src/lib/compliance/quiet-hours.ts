// SPEC-009: TCPA quiet hours. Outbound marketing may only be sent between 08:00 (inclusive) and 21:00
// (exclusive) in the recipient's local time. Timezone resolves from the Organization's `timezone`
// (per-contact timezone + state-specific windows are a future refinement — see plan/specs/SPEC-009).
// Pure logic, no DB access; the live-send path supplies `now` + the resolved timezone.

export const QUIET_HOURS_START_HOUR = 8; // inclusive
export const QUIET_HOURS_END_HOUR = 21; // exclusive (9pm)

export type QuietHoursWindow = {
  startHour: number;
  endHour: number;
};

// Florida: 8am - 8pm, Texas: 9am - 9pm, Indiana: 9am - 8pm, Alabama: 8am - 8pm
export const STATE_WINDOW_OVERRIDES: Record<string, QuietHoursWindow> = {
  FL: { startHour: 8, endHour: 20 },
  TX: { startHour: 9, endHour: 21 },
  IN: { startHour: 9, endHour: 20 },
  AL: { startHour: 8, endHour: 20 }
};

export function quietHoursWindowForState(state?: string): QuietHoursWindow {
  if (state) {
    const normalized = state.toUpperCase().trim();
    const override = STATE_WINDOW_OVERRIDES[normalized];
    if (override) {
      return override;
    }
  }
  return { startHour: QUIET_HOURS_START_HOUR, endHour: QUIET_HOURS_END_HOUR };
}

export function localHourInTimeZone(now: Date, timeZone: string): number {
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone
    }).format(now);
    const hour = Number.parseInt(formatted, 10);
    return Number.isFinite(hour) ? hour % 24 : Number.NaN;
  } catch {
    // Invalid/unknown timezone.
    return Number.NaN;
  }
}

export function isWithinQuietHours(now: Date, timeZone: string, state?: string): boolean {
  const hour = localHourInTimeZone(now, timeZone);
  if (!Number.isFinite(hour)) {
    // Fail safe: an unresolvable timezone is treated as quiet hours (blocked), never as permissive.
    return true;
  }
  const window = quietHoursWindowForState(state);
  return hour < window.startHour || hour >= window.endHour;
}

export function quietHoursBlockReason(now: Date, timeZone: string, state?: string): "QUIET_HOURS" | null {
  return isWithinQuietHours(now, timeZone, state) ? "QUIET_HOURS" : null;
}
