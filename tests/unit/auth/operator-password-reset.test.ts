import { describe, expect, it, vi } from "vitest";
import { hashOpaqueToken } from "@/lib/auth/crypto";
import {
  OperatorPasswordResetError,
  issueOperatorPasswordReset,
  type OperatorPasswordResetDependencies,
  type OperatorPasswordResetStore
} from "@/lib/auth/operator-password-reset";

const NOW = new Date("2026-07-10T22:00:00.000Z");
const TOKEN = `ss_reset_${"o".repeat(43)}`;

function dependencies(
  issue: OperatorPasswordResetStore["issue"] = vi.fn(async (input) => ({
    ok: true as const,
    email: "target@example.test",
    expiresAt: input.expiresAt
  }))
): OperatorPasswordResetDependencies {
  return {
    store: { issue },
    now: () => NOW,
    createToken: () => ({ token: TOKEN, tokenHash: hashOpaqueToken(TOKEN) })
  };
}

describe("operator password reset issuance", () => {
  it("normalizes public identity input and gives storage only the bearer hash", async () => {
    const deps = dependencies();
    const result = await issueOperatorPasswordReset(
      {
        email: " Target@Example.TEST ",
        organizationSlug: " Reset-Org ",
        expiresInMinutes: 30
      },
      deps
    );

    expect(vi.mocked(deps.store.issue)).toHaveBeenCalledWith({
      normalizedEmail: "target@example.test",
      organizationSlug: "reset-org",
      tokenHash: hashOpaqueToken(TOKEN),
      now: NOW,
      expiresAt: new Date(NOW.getTime() + 30 * 60_000)
    });
    expect(result).toEqual({
      token: TOKEN,
      email: "target@example.test",
      expiresAt: new Date(NOW.getTime() + 30 * 60_000)
    });
    expect(JSON.stringify(vi.mocked(deps.store.issue).mock.calls)).not.toContain(TOKEN);
  });

  it("rejects malformed input and token generators before storage", async () => {
    const deps = dependencies();
    await expect(
      issueOperatorPasswordReset(
        { email: "invalid", organizationSlug: "Bad Slug" },
        deps
      )
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(vi.mocked(deps.store.issue)).not.toHaveBeenCalled();

    await expect(
      issueOperatorPasswordReset(
        { email: "target@example.test", organizationSlug: "reset-org" },
        { ...deps, createToken: () => ({ token: TOKEN, tokenHash: "wrong" }) }
      )
    ).rejects.toMatchObject({ code: "OPERATION_FAILED" });
  });

  it("sanitizes unavailable subjects and unexpected storage failures", async () => {
    const unavailable = dependencies(vi.fn(async () => ({ ok: false as const })));
    await expect(
      issueOperatorPasswordReset(
        { email: "private@example.test", organizationSlug: "reset-org" },
        unavailable
      )
    ).rejects.toMatchObject({ code: "SUBJECT_UNAVAILABLE" });

    const failed = dependencies(
      vi.fn(async () => {
        throw new Error(`database ${TOKEN}`);
      })
    );
    const error = await issueOperatorPasswordReset(
      { email: "private@example.test", organizationSlug: "reset-org" },
      failed
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OperatorPasswordResetError);
    expect(error).toMatchObject({ code: "OPERATION_FAILED" });
    expect(JSON.stringify(error)).not.toContain(TOKEN);
  });
});
