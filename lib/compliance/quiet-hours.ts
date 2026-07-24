// M8: Jurisdiction & Recipient Local Timezone Quiet Hours
// TCPA & state-specific quiet hours enforcement.
// Outbound marketing may only be sent between allowed sending windows in the recipient's local time.
// Default federal window: 08:00 (inclusive) to 21:00 (exclusive).
// State jurisdiction overrides enforce stricter state law limits.
// Fail-closed design: unresolvable or invalid timezones return isWithinQuietHours = true.

import { resolveTimezoneFromPhone } from "@/lib/compliance/area-codes";

export const QUIET_HOURS_START_HOUR = 8; // inclusive (8am)
export const QUIET_HOURS_END_HOUR = 21; // exclusive (9pm)

export type QuietHoursWindow = {
  startHour: number;
  endHour: number;
};

// Florida: 8am - 8pm, Texas: 9am - 9pm, Indiana: 9am - 8pm, Alabama: 8am - 8pm,
// Washington: 8am - 8pm, Utah: 8am - 8pm, Oklahoma: 8am - 8pm, Mississippi: 8am - 8pm,
// Maryland: 8am - 8pm, Connecticut: 8am - 8pm, Nevada: 8am - 8pm
export const STATE_WINDOW_OVERRIDES: Record<string, QuietHoursWindow> = {
  FL: { startHour: 8, endHour: 20 },
  TX: { startHour: 9, endHour: 21 },
  IN: { startHour: 9, endHour: 20 },
  AL: { startHour: 8, endHour: 20 },
  WA: { startHour: 8, endHour: 20 },
  UT: { startHour: 8, endHour: 20 },
  OK: { startHour: 8, endHour: 20 },
  MS: { startHour: 8, endHour: 20 },
  MD: { startHour: 8, endHour: 20 },
  CT: { startHour: 8, endHour: 20 },
  NV: { startHour: 8, endHour: 20 }
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

export function localHourInTimeZone(now: Date, timeZone?: string | null): number {
  if (!timeZone || typeof timeZone !== "string" || timeZone.trim().length === 0) {
    return Number.NaN;
  }
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timeZone.trim()
    }).format(now);
    const hour = Number.parseInt(formatted, 10);
    return Number.isFinite(hour) ? hour % 24 : Number.NaN;
  } catch {
    // Invalid/unknown timezone.
    return Number.NaN;
  }
}

export type RecipientTimeZoneResolution = {
  timeZone: string | null;
  source: "contact_timezone" | "area_code" | "org_timezone" | "unresolved_fallback";
};

export function resolveRecipientTimeZone(input: {
  contactTimeZone?: string | null;
  phone?: string | null;
  orgTimeZone?: string | null;
}): RecipientTimeZoneResolution {
  if (input.contactTimeZone && isValidTimeZone(input.contactTimeZone)) {
    return { timeZone: input.contactTimeZone, source: "contact_timezone" };
  }

  if (input.phone) {
    const areaCodeTz = resolveTimezoneFromPhone(input.phone, "");
    if (areaCodeTz && isValidTimeZone(areaCodeTz)) {
      return { timeZone: areaCodeTz, source: "area_code" };
    }
  }

  if (input.orgTimeZone && isValidTimeZone(input.orgTimeZone)) {
    return { timeZone: input.orgTimeZone, source: "org_timezone" };
  }

  return { timeZone: null, source: "unresolved_fallback" };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function isWithinQuietHours(now: Date, timeZone?: string | null, state?: string | null): boolean {
  const hour = localHourInTimeZone(now, timeZone);
  if (!Number.isFinite(hour)) {
    // Fail safe: an unresolvable or missing timezone is treated as quiet hours (blocked), never permissive.
    return true;
  }
  const window = quietHoursWindowForState(state ?? undefined);
  return hour < window.startHour || hour >= window.endHour;
}

export function quietHoursBlockReason(now: Date, timeZone?: string | null, state?: string | null): "QUIET_HOURS" | null {
  return isWithinQuietHours(now, timeZone, state) ? "QUIET_HOURS" : null;
}
