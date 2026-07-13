import { describe, expect, it } from "vitest";
import {
  assertApiKeyControlPolicyShape,
  assertDispatchCapabilityShape,
  assertRuntimePolicyShapes
} from "@/lib/db/runtime-posture";
import { ordinaryTenantTables } from "@/lib/db/tenant-manifest";

const currentOrg = "NULLIF(current_setting('app.current_org_id'::text, true), ''::text)";
const orgScope = `("orgId" = ${currentOrg})`;

type PolicyRow = Readonly<{
  tableName: string;
  policyName: string;
  command: string;
  permissive: string;
  roles: string[];
  usingExpression: string | null;
  checkExpression: string | null;
}>;

describe("runtime policy posture", () => {
  it("accepts the reviewed tenant policy manifest", () => {
    expect(() => assertRuntimePolicyShapes(reviewedPolicies())).not.toThrow();
  });

  it("requires owner-bound dispatch and provider-routing functions with exact capabilities", () => {
    const reviewed = (functionName: string, capability: "worker" | "web") => ({
      functionName,
      securityDefiner: true,
      settings: ["search_path=pg_catalog, public"],
      publicExecute: false,
      workerExecute: capability === "worker",
      runtimeExecute: false,
      controlExecute: false,
      webExecute: capability === "web",
      ownerMember: true
    });
    const rows = [
      reviewed("claim_due_queue_jobs", "worker"),
      reviewed("claim_due_customer_webhook_deliveries", "worker"),
      reviewed("claim_due_message_attempts", "worker"),
      reviewed("recover_expired_message_attempts", "worker"),
      reviewed("resolve_verified_provider_destination", "web")
    ];
    expect(() => assertDispatchCapabilityShape(rows)).not.toThrow();
    expect(() =>
      assertDispatchCapabilityShape([
        { ...rows[0]!, publicExecute: true },
        rows[1]!,
        rows[2]!
      ])
    ).toThrow("capability shape is invalid");
    expect(() =>
      assertDispatchCapabilityShape([
        { ...rows[0]!, settings: ["search_path=public"] },
        rows[1]!,
        rows[2]!
      ])
    ).toThrow("capability shape is invalid");
    expect(() => assertDispatchCapabilityShape([rows[0]!, rows[0]!])).toThrow(
      "capability shape is invalid"
    );
  });

  it("requires an exact-hash SELECT-only API-key control policy", () => {
    const reviewed = {
      policyName: "api_key_control_select_scope",
      command: "SELECT",
      permissive: "PERMISSIVE",
      roles: ["signalstack_control"],
      usingExpression:
        `((current_setting('app.control_purpose'::text, true) = 'api_key'::text) AND ` +
        `("secretHash" = NULLIF(current_setting('app.current_api_key_hash'::text, true), ''::text)))`,
      checkExpression: null,
      controlSelect: true,
      controlInsert: false,
      controlUpdate: false,
      controlDelete: false,
      publicPrivilege: false
    };
    expect(() => assertApiKeyControlPolicyShape([reviewed])).not.toThrow();
    expect(() =>
      assertApiKeyControlPolicyShape([{ ...reviewed, usingExpression: "true" }])
    ).toThrow("capability shape is invalid");
    expect(() =>
      assertApiKeyControlPolicyShape([{ ...reviewed, controlUpdate: true }])
    ).toThrow("capability shape is invalid");
  });

  it("rejects a present policy whose predicate drifts to allow-all", () => {
    const rows = reviewedPolicies().map((row) =>
      row.tableName === "Contact"
        ? { ...row, usingExpression: "true", checkExpression: "true" }
        : row
    );

    expect(() => assertRuntimePolicyShapes(rows)).toThrow("policy shape is invalid");
  });

  it("rejects extra policies and command or role drift", () => {
    const commandDrift = reviewedPolicies().map((row) =>
      row.tableName === "AppUser" ? { ...row, command: "ALL" } : row
    );
    expect(() => assertRuntimePolicyShapes(commandDrift)).toThrow("policy shape is invalid");

    const roleDrift = reviewedPolicies().map((row) =>
      row.tableName === "Organization"
        ? { ...row, roles: ["signalstack_runtime", "public"] }
        : row
    );
    expect(() => assertRuntimePolicyShapes(roleDrift)).toThrow("policy shape is invalid");

    expect(() =>
      assertRuntimePolicyShapes([
        ...reviewedPolicies(),
        { ...reviewedPolicies()[0]!, policyName: "unexpected" }
      ])
    ).toThrow("policy shape is invalid");
  });
});

function reviewedPolicies(): PolicyRow[] {
  const rows = ordinaryTenantTables.map((tableName) => policy(tableName, "ALL", orgScope, orgScope));
  rows.push(policy("Membership", "ALL", orgScope, orgScope));
  rows.push(policy("AuthSession", "ALL", orgScope, orgScope));

  const organizationScope = `(id = ${currentOrg})`;
  rows.push(policy("Organization", "ALL", organizationScope, organizationScope));
  rows.push(
    policy(
      "AppUser",
      "SELECT",
      `(EXISTS (SELECT 1 FROM "Membership" membership WHERE (` +
        `(membership."userId" = "AppUser".id) AND ` +
        `(membership."orgId" = ${currentOrg}))))`,
      null
    )
  );
  const inviteScope = `((type = 'INVITE'::"AuthTokenType") AND ("orgId" = ${currentOrg}))`;
  rows.push(policy("AuthToken", "ALL", inviteScope, inviteScope));
  return rows;
}

function policy(
  tableName: string,
  command: string,
  usingExpression: string,
  checkExpression: string | null
): PolicyRow {
  return {
    tableName,
    policyName: "tenant_scope",
    command,
    permissive: "PERMISSIVE",
    roles: ["signalstack_runtime"],
    usingExpression,
    checkExpression
  };
}
