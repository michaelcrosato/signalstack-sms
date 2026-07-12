import { describe, expect, it, vi } from "vitest";
import {
  formatTenantIntegrityFindings,
  runTenantIntegrityPreflight,
  tenantIntegrityChecks,
  tenantIntegrityPreflightExitCode,
  tenantIntegrityReadOnlyStatement
} from "@/scripts/tenant-integrity-preflight";

const expectedChecks = [
  "contact-tag.contact",
  "contact-tag.tag",
  "contact-list-member.list",
  "contact-list-member.contact",
  "campaign.template",
  "campaign-recipient.campaign",
  "campaign-recipient.contact",
  "conversation.contact",
  "queue-job.campaign",
  "message.contact",
  "message.conversation",
  "message.campaign",
  "internal-note.conversation",
  "provider-credential-rotation.credential",
  "provider-credential-secret.account",
  "provider-messaging-service.account",
  "provider-phone-number.account",
  "provider-phone-number.messaging-service",
  "api-idempotency-record.credential",
  "integration-audit-event.credential",
  "integration-audit-event.subject",
  "customer-webhook-subscription.endpoint",
  "customer-webhook-signing-secret.subscription",
  "customer-webhook-delivery.subscription",
  "customer-webhook-delivery.event",
  "customer-webhook-delivery.signing-secret",
  "customer-webhook-delivery.replay",
  "customer-webhook-delivery-attempt.delivery",
  "conversation.active-assignee",
  "auth-session.active-membership",
  "auth-token.pending-invite-issuer",
  "queue-job.scheduled-envelope"
] as const;

describe("tenant integrity preflight", () => {
  it("maintains a unique, count-only inventory of strict relations and current membership refs", () => {
    expect(tenantIntegrityChecks.map(({ id }) => id)).toEqual(expectedChecks);
    expect(new Set(expectedChecks).size).toBe(expectedChecks.length);
    expect(tenantIntegrityChecks.filter(({ category }) => category === "strict-relation")).toHaveLength(28);
    expect(tenantIntegrityChecks.filter(({ category }) => category === "current-membership")).toHaveLength(3);
    expect(tenantIntegrityChecks.filter(({ category }) => category === "job-envelope")).toHaveLength(1);
    expect(tenantIntegrityReadOnlyStatement).toBe("SET TRANSACTION READ ONLY");

    for (const check of tenantIntegrityChecks) {
      expect(check.query.trimStart()).toMatch(/^SELECT COUNT\(\*\)::bigint AS "count"/);
      expect(check.query).not.toMatch(/SELECT\s+(?:child|parent|membership|app_user)\./i);
      expect(check.query).not.toContain(";");
    }
  });

  it("executes every count and normalizes bigint, number, and numeric-string results", async () => {
    const execute = vi.fn(async (query: string) => {
      void query;
      const index = execute.mock.calls.length;
      return [{ count: index % 3 === 0 ? BigInt(index) : index % 3 === 1 ? index : String(index) }];
    });

    const findings = await runTenantIntegrityPreflight(execute);

    expect(execute).toHaveBeenCalledTimes(expectedChecks.length);
    expect(findings.map(({ id }) => id)).toEqual(expectedChecks);
    expect(findings.map(({ violations }) => violations)).toEqual(
      expectedChecks.map((_, index) => index + 1)
    );
    expect(tenantIntegrityPreflightExitCode(findings)).toBe(1);
  });

  it("emits only relation identifiers, categories, counts, and a summary", async () => {
    const findings = await runTenantIntegrityPreflight(async () => [{ count: 0n }]);
    const output = formatTenantIntegrityFindings(findings);

    expect(tenantIntegrityPreflightExitCode(findings)).toBe(0);
    expect(output.split("\n")).toHaveLength(expectedChecks.length + 1);
    for (const line of output.split("\n")) {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      expect(Object.keys(parsed).sort()).toEqual(
        "summary" in parsed
          ? ["relationsChecked", "status", "summary", "violatingRelations"]
          : ["category", "relation", "violations"]
      );
    }
    expect(output).not.toMatch(/@|\+\d{6}|message body|rawPayload/i);
  });

  it.each([
    [[]],
    [[{ total: 0 }]],
    [[{ count: -1 }]],
    [[{ count: "not-a-count" }]],
    [[{ count: Number.MAX_SAFE_INTEGER + 1 }]]
  ])("rejects invalid count result %#", async (result) => {
    await expect(
      runTenantIntegrityPreflight(async () => result, [tenantIntegrityChecks[0]])
    ).rejects.toThrow(/count|shape/i);
  });
});
