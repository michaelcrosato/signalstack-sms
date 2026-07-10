import { describe, expect, it } from "vitest";
import {
  readinessAuditQuerySchema,
  readinessAuditQueryLimitMax,
  readinessAuditQueryLimitDefault
} from "@/lib/validation/readiness-audit";
import {
  allowedReadinessAuditOperationActions,
  allowedReadinessAuditOperationSubjectTypes
} from "@/lib/operations/readiness-audit-operations";

describe("readiness audit validation", () => {
  it("exports correct limit constants", () => {
    expect(readinessAuditQueryLimitDefault).toBe(50);
    expect(readinessAuditQueryLimitMax).toBe(200);
  });

  describe("readinessAuditQuerySchema", () => {
    it("accepts empty object and provides defaults", () => {
      expect(readinessAuditQuerySchema.parse({})).toMatchObject({
        limit: readinessAuditQueryLimitDefault
      });
    });

    it("accepts valid full input", () => {
      expect(
        readinessAuditQuerySchema.parse({
          action: allowedReadinessAuditOperationActions[0],
          subjectType: allowedReadinessAuditOperationSubjectTypes[0],
          limit: 100
        })
      ).toMatchObject({
        action: allowedReadinessAuditOperationActions[0],
        subjectType: allowedReadinessAuditOperationSubjectTypes[0],
        limit: 100
      });
    });

    it("enforces minimum limit", () => {
      const result = readinessAuditQuerySchema.safeParse({ limit: 0 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("greater than or equal to 1");
      }
    });

    it("enforces maximum limit", () => {
      const result = readinessAuditQuerySchema.safeParse({ limit: 201 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(`less than or equal to 200`);
      }
    });

    it("rejects invalid action enum", () => {
      const result = readinessAuditQuerySchema.safeParse({ action: "INVALID_ACTION" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Invalid enum value");
      }
    });

    it("rejects invalid subjectType enum", () => {
      const result = readinessAuditQuerySchema.safeParse({ subjectType: "InvalidType" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Invalid enum value");
      }
    });

    it("coerces string limit to number", () => {
      expect(readinessAuditQuerySchema.parse({ limit: "150" })).toMatchObject({
        limit: 150
      });
    });
  });
});
