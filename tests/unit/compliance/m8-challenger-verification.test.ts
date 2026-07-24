import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  isWithinQuietHours,
  quietHoursBlockReason,
  quietHoursWindowForState,
  localHourInTimeZone,
  resolveRecipientTimeZone,
  isValidTimeZone,
  QUIET_HOURS_START_HOUR,
  QUIET_HOURS_END_HOUR
} from "@/lib/compliance/quiet-hours";
import { DEFAULT_MESSAGE_RETENTION_DAYS, DEFAULT_RAW_PAYLOAD_RETENTION_DAYS } from "@/lib/compliance/retention-worker";
import * as consentEventsRepo from "@/lib/db/repositories/consent-events";
import * as auditEventsRepo from "@/lib/db/repositories/audit-events";
import { appendOnlyTenantTables, nonDeletableTenantTables, ordinaryTenantTables } from "@/lib/db/tenant-manifest";

const TZ_LA = "America/Los_Angeles";
const TZ_NY = "America/New_York";
const at = (utcString: string) => new Date(utcString);

describe("M8 Challenger: Quiet Hours Evaluation & Edge Cases", () => {
  describe("1. Timezone Validity & Local Hour Resolution", () => {
    it("returns true for valid timezones and false for invalid ones", () => {
      expect(isValidTimeZone("America/Los_Angeles")).toBe(true);
      expect(isValidTimeZone("Europe/London")).toBe(true);
      expect(isValidTimeZone("Asia/Tokyo")).toBe(true);
      expect(isValidTimeZone("UTC")).toBe(true);
      
      expect(isValidTimeZone("Invalid/Timezone")).toBe(false);
      expect(isValidTimeZone("")).toBe(false);
      expect(isValidTimeZone("   ")).toBe(false);
      expect(isValidTimeZone("12345")).toBe(false);
    });

    it("correctly computes local hour in valid timezones", () => {
      // 2026-06-01T15:00:00Z is 15:00 UTC
      // America/Los_Angeles is UTC-7 (PDT) -> 08:00
      expect(localHourInTimeZone(at("2026-06-01T15:00:00Z"), TZ_LA)).toBe(8);
      // America/New_York is UTC-4 (EDT) -> 11:00
      expect(localHourInTimeZone(at("2026-06-01T15:00:00Z"), TZ_NY)).toBe(11);
      // Europe/London is UTC+1 (BST) -> 16:00
      expect(localHourInTimeZone(at("2026-06-01T15:00:00Z"), "Europe/London")).toBe(16);
      // Asia/Tokyo is UTC+9 (JST) -> 00:00 (next day, June 2)
      expect(localHourInTimeZone(at("2026-06-01T15:00:00Z"), "Asia/Tokyo")).toBe(0);
    });

    it("returns NaN for invalid or empty timezone inputs to force fail-closed", () => {
      const now = new Date();
      expect(Number.isNaN(localHourInTimeZone(now, null))).toBe(true);
      expect(Number.isNaN(localHourInTimeZone(now, undefined))).toBe(true);
      expect(Number.isNaN(localHourInTimeZone(now, ""))).toBe(true);
      expect(Number.isNaN(localHourInTimeZone(now, "   "))).toBe(true);
      expect(Number.isNaN(localHourInTimeZone(now, "Invalid/Timezone"))).toBe(true);
    });

    it("handles fractional timezones gracefully", () => {
      // Asia/Kolkata is UTC+5:30
      // 2026-06-01T15:00:00Z + 5h30m = 20:30 (8:30 PM), so local hour is 20
      expect(localHourInTimeZone(at("2026-06-01T15:00:00Z"), "Asia/Kolkata")).toBe(20);
    });
  });

  describe("2. Fail-Closed Quiet Hours Enforcement", () => {
    it("blocks sends (returns true) when timezone is unresolvable or invalid", () => {
      const activeHourUtc = at("2026-06-01T19:00:00Z"); // Would be 12:00 in LA
      expect(isWithinQuietHours(activeHourUtc, null)).toBe(true);
      expect(isWithinQuietHours(activeHourUtc, undefined)).toBe(true);
      expect(isWithinQuietHours(activeHourUtc, "Invalid/Timezone")).toBe(true);
      expect(isWithinQuietHours(activeHourUtc, "")).toBe(true);

      expect(quietHoursBlockReason(activeHourUtc, "Invalid/Timezone")).toBe("QUIET_HOURS");
    });
  });

  describe("3. Boundary Conditions (Default 08:00 - 21:00)", () => {
    it("verifies exact boundary transition for default federal quiet hours", () => {
      // LA PDT (UTC-7)
      // 07:59:59 PDT -> 14:59:59 UTC -> quiet hours (true)
      expect(isWithinQuietHours(at("2026-06-01T14:59:59Z"), TZ_LA)).toBe(true);
      // 08:00:00 PDT -> 15:00:00 UTC -> allowed (false)
      expect(isWithinQuietHours(at("2026-06-01T15:00:00Z"), TZ_LA)).toBe(false);
      // 20:59:59 PDT -> 03:59:59 UTC (next day) -> allowed (false)
      expect(isWithinQuietHours(at("2026-06-02T03:59:59Z"), TZ_LA)).toBe(false);
      // 21:00:00 PDT -> 04:00:00 UTC (next day) -> quiet hours (true)
      expect(isWithinQuietHours(at("2026-06-02T04:00:00Z"), TZ_LA)).toBe(true);
      // Midnight PDT (00:00) -> 07:00:00 UTC -> quiet hours (true)
      expect(isWithinQuietHours(at("2026-06-01T07:00:00Z"), TZ_LA)).toBe(true);
    });
  });

  describe("4. State-Specific Overrides", () => {
    it("validates quiet hours windows for all 11 state overrides", () => {
      expect(quietHoursWindowForState("FL")).toEqual({ startHour: 8, endHour: 20 });
      expect(quietHoursWindowForState("TX")).toEqual({ startHour: 9, endHour: 21 });
      expect(quietHoursWindowForState("IN")).toEqual({ startHour: 9, endHour: 20 });
      expect(quietHoursWindowForState("AL")).toEqual({ startHour: 8, endHour: 20 });
      expect(quietHoursWindowForState("WA")).toEqual({ startHour: 8, endHour: 20 });
      expect(quietHoursWindowForState("UT")).toEqual({ startHour: 8, endHour: 20 });
      expect(quietHoursWindowForState("OK")).toEqual({ startHour: 8, endHour: 20 });
      expect(quietHoursWindowForState("MS")).toEqual({ startHour: 8, endHour: 20 });
      expect(quietHoursWindowForState("MD")).toEqual({ startHour: 8, endHour: 20 });
      expect(quietHoursWindowForState("CT")).toEqual({ startHour: 8, endHour: 20 });
      expect(quietHoursWindowForState("NV")).toEqual({ startHour: 8, endHour: 20 });
    });

    it("normalizes case and padding for state codes", () => {
      expect(quietHoursWindowForState("  fl  ")).toEqual({ startHour: 8, endHour: 20 });
      expect(quietHoursWindowForState("tx")).toEqual({ startHour: 9, endHour: 21 });
      expect(quietHoursWindowForState("In")).toEqual({ startHour: 9, endHour: 20 });
    });

    it("falls back to default window for unknown or unmapped states", () => {
      const defaultWin = { startHour: QUIET_HOURS_START_HOUR, endHour: QUIET_HOURS_END_HOUR };
      expect(quietHoursWindowForState("CA")).toEqual(defaultWin);
      expect(quietHoursWindowForState("NY")).toEqual(defaultWin);
      expect(quietHoursWindowForState("FLORIDA")).toEqual(defaultWin); // Full name not mapped
      expect(quietHoursWindowForState(undefined)).toEqual(defaultWin);
    });

    it("enforces state-specific quiet hours boundaries", () => {
      // FL: 08:00 to 20:00 (8pm)
      // 19:59 PDT -> hour 19 -> allowed in FL
      expect(isWithinQuietHours(at("2026-06-02T02:59:00Z"), TZ_LA, "FL")).toBe(false);
      // 20:00 PDT -> hour 20 -> blocked in FL
      expect(isWithinQuietHours(at("2026-06-02T03:00:00Z"), TZ_LA, "FL")).toBe(true);

      // TX: 09:00 to 21:00 (9am to 9pm)
      // 08:00 PDT -> hour 8 -> blocked in TX (starts at 9am)
      expect(isWithinQuietHours(at("2026-06-01T15:00:00Z"), TZ_LA, "TX")).toBe(true);
      // 09:00 PDT -> hour 9 -> allowed in TX
      expect(isWithinQuietHours(at("2026-06-01T16:00:00Z"), TZ_LA, "TX")).toBe(false);
    });
  });

  describe("5. Timezone Resolution Cascade", () => {
    it("prioritizes contactTimeZone over area code, orgTimeZone, and fallback", () => {
      const res = resolveRecipientTimeZone({
        contactTimeZone: "America/Chicago",
        phone: "+14155550100", // SF -> LA
        orgTimeZone: "America/New_York"
      });
      expect(res).toEqual({ timeZone: "America/Chicago", source: "contact_timezone" });
    });

    it("falls back to area code when contactTimeZone is missing or invalid", () => {
      const res = resolveRecipientTimeZone({
        contactTimeZone: "Invalid/TZ",
        phone: "+14155550100", // SF area code 415 -> America/Los_Angeles
        orgTimeZone: "America/New_York"
      });
      expect(res).toEqual({ timeZone: "America/Los_Angeles", source: "area_code" });
    });

    it("falls back to orgTimeZone when phone area code is unknown or unmapped", () => {
      const res = resolveRecipientTimeZone({
        contactTimeZone: null,
        phone: "+19995550100", // Area code 999 does not resolve in resolveTimezoneFromPhone(phone, "")
        orgTimeZone: "America/Denver"
      });
      expect(res).toEqual({ timeZone: "America/Denver", source: "org_timezone" });

      const resNoPhone = resolveRecipientTimeZone({
        contactTimeZone: null,
        phone: null,
        orgTimeZone: "America/Denver"
      });
      expect(resNoPhone).toEqual({ timeZone: "America/Denver", source: "org_timezone" });
    });

    it("returns unresolved_fallback when no timezone can be determined", () => {
      const res = resolveRecipientTimeZone({
        contactTimeZone: undefined,
        phone: undefined,
        orgTimeZone: undefined
      });
      expect(res).toEqual({ timeZone: null, source: "unresolved_fallback" });
    });
  });
});

describe("M8 Challenger: Data Retention Worker Pruning Logic", () => {
  it("verifies retention defaults", () => {
    expect(DEFAULT_MESSAGE_RETENTION_DAYS).toBe(30);
    expect(DEFAULT_RAW_PAYLOAD_RETENTION_DAYS).toBe(30);
  });

  it("ensures retention worker NEVER alters consent events, audit events, or suppression lists", () => {
    const workerCode = fs.readFileSync(
      path.join(process.cwd(), "lib/compliance/retention-worker.ts"),
      "utf-8"
    );

    expect(workerCode).not.toContain("consentEvent");
    expect(workerCode).not.toContain("auditEvent");
    expect(workerCode).not.toContain("suppressionEntry");
    expect(workerCode).not.toContain("deleteMany");
    expect(workerCode).toContain('[RETENTION_PURGED]');
  });

  it("verifies retention worker updates target models with sanitization markers", () => {
    const workerCode = fs.readFileSync(
      path.join(process.cwd(), "lib/compliance/retention-worker.ts"),
      "utf-8"
    );

    // Verify Message update
    expect(workerCode).toContain("tx.message.updateMany");
    expect(workerCode).toContain('body: "[RETENTION_PURGED]"');
    expect(workerCode).toContain("mediaUrls: []");

    // Verify MessageAttempt update
    expect(workerCode).toContain("tx.messageAttempt.updateMany");

    // Verify WebhookEvent update
    expect(workerCode).toContain("tx.webhookEvent.updateMany");
    expect(workerCode).toContain("rawPayload: { purged: true }");

    // Verify CustomerWebhookEvent update
    expect(workerCode).toContain("tx.customerWebhookEvent.updateMany");
    expect(workerCode).toContain('payloadText: "[RETENTION_PURGED]"');
  });
});

describe("M8 Challenger: Immutability & Append-Only Repositories", () => {
  it("verifies consent-events repository exposes NO update or delete operations", () => {
    const exportedKeys = Object.keys(consentEventsRepo);
    expect(exportedKeys).toContain("recordConsentEvent");
    expect(exportedKeys).toContain("listConsentEvents");
    expect(exportedKeys).toContain("getConsentEvent");

    const mutationKeys = exportedKeys.filter(key =>
      key.toLowerCase().includes("update") ||
      key.toLowerCase().includes("delete") ||
      key.toLowerCase().includes("remove") ||
      key.toLowerCase().includes("purge") ||
      key.toLowerCase().includes("modify")
    );

    expect(mutationKeys).toEqual([]);
  });

  it("verifies audit-events repository exposes NO update or delete operations", () => {
    const exportedKeys = Object.keys(auditEventsRepo);
    expect(exportedKeys).toContain("recordAuditEvent");
    expect(exportedKeys).toContain("listAuditEvents");
    expect(exportedKeys).toContain("getAuditEvent");

    const mutationKeys = exportedKeys.filter(key =>
      key.toLowerCase().includes("update") ||
      key.toLowerCase().includes("delete") ||
      key.toLowerCase().includes("remove") ||
      key.toLowerCase().includes("purge") ||
      key.toLowerCase().includes("modify")
    );

    expect(mutationKeys).toEqual([]);
  });

  it("verifies tenant manifest classifies ConsentEvent and AuditEvent as append-only and non-deletable", () => {
    expect(ordinaryTenantTables).toContain("ConsentEvent");
    expect(ordinaryTenantTables).toContain("AuditEvent");
    expect(ordinaryTenantTables).toContain("SuppressionEntry");

    expect(appendOnlyTenantTables).toContain("ConsentEvent");
    expect(appendOnlyTenantTables).toContain("AuditEvent");

    expect(nonDeletableTenantTables).toContain("ConsentEvent");
    expect(nonDeletableTenantTables).toContain("AuditEvent");
    expect(nonDeletableTenantTables).toContain("SuppressionEntry");

    expect(Object.isFrozen(appendOnlyTenantTables)).toBe(true);
    expect(Object.isFrozen(nonDeletableTenantTables)).toBe(true);
  });
});
