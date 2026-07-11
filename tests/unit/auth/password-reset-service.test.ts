import { describe, expect, it, vi } from "vitest";
import { hashOpaqueToken } from "@/lib/auth/crypto";
import {
  PasswordResetServiceError,
  completePasswordReset,
  type PasswordResetStore
} from "@/lib/auth/password-reset-service";

const TOKEN = `ss_reset_${"a".repeat(43)}`;
const TOKEN_HASH = hashOpaqueToken(TOKEN);
const PASSWORD = "correct horse battery staple";
const PASSWORD_HASH = "scrypt$v=1$redacted-test-hash";
const FIRST_TIME = new Date("2026-07-10T22:00:00.000Z");
const SECOND_TIME = new Date("2026-07-10T22:00:01.000Z");

function createStore(overrides: Partial<PasswordResetStore> = {}): PasswordResetStore {
  return {
    resetAvailable: vi.fn(async () => true),
    completeReset: vi.fn(async (input) => ({
      ok: true as const,
      value: { completedAt: input.now }
    })),
    ...overrides
  };
}

describe("operator password reset completion", () => {
  it("preflights the token hash before hashing and uses fresh time for the atomic claim", async () => {
    const store = createStore();
    const encodePassword = vi.fn(async () => PASSWORD_HASH);
    const now = vi.fn().mockReturnValueOnce(FIRST_TIME).mockReturnValueOnce(SECOND_TIME);

    const result = await completePasswordReset(
      { token: TOKEN, password: PASSWORD },
      { store, encodePassword, now }
    );

    expect(store.resetAvailable).toHaveBeenCalledWith(TOKEN_HASH, FIRST_TIME);
    expect(encodePassword).toHaveBeenCalledWith(PASSWORD);
    expect(store.completeReset).toHaveBeenCalledWith({
      tokenHash: TOKEN_HASH,
      passwordHash: PASSWORD_HASH,
      now: SECOND_TIME
    });
    expect(result).toEqual({ completed: true, completedAt: SECOND_TIME });
    expect(JSON.stringify(result)).not.toMatch(/ss_reset_|password|scrypt/i);
  });

  it("rejects unavailable bearers before password hashing", async () => {
    const store = createStore({ resetAvailable: vi.fn(async () => false) });
    const encodePassword = vi.fn(async () => PASSWORD_HASH);

    await expect(
      completePasswordReset({ token: TOKEN, password: PASSWORD }, { store, encodePassword })
    ).rejects.toMatchObject({
      code: "PASSWORD_RESET_UNAVAILABLE",
      message: "Password reset is unavailable."
    });
    expect(encodePassword).not.toHaveBeenCalled();
    expect(store.completeReset).not.toHaveBeenCalled();
  });

  it("uses one unavailable denial for a lost atomic claim", async () => {
    const store = createStore({
      completeReset: vi.fn(async () => ({
        ok: false as const,
        reason: "RESET_UNAVAILABLE" as const
      }))
    });
    await expect(
      completePasswordReset(
        { token: TOKEN, password: PASSWORD },
        { store, encodePassword: async () => PASSWORD_HASH }
      )
    ).rejects.toMatchObject({ code: "PASSWORD_RESET_UNAVAILABLE" });
  });

  it("rejects malformed tokens, extra fields, and weak passwords before storage", async () => {
    const store = createStore();
    for (const input of [
      { token: "bad", password: PASSWORD },
      { token: TOKEN, password: "too short" },
      { token: TOKEN, password: PASSWORD, userId: "victim" }
    ]) {
      await expect(completePasswordReset(input, { store })).rejects.toBeInstanceOf(
        PasswordResetServiceError
      );
    }
    expect(store.resetAvailable).not.toHaveBeenCalled();
    expect(store.completeReset).not.toHaveBeenCalled();
  });

  it("sanitizes preflight, encoder, and transaction failures", async () => {
    const privateDetail = `${TOKEN}:${PASSWORD}:${PASSWORD_HASH}`;
    const cases = [
      {
        store: createStore({
          resetAvailable: vi.fn(async () => {
            throw new Error(privateDetail);
          })
        }),
        encodePassword: async () => PASSWORD_HASH
      },
      {
        store: createStore(),
        encodePassword: async () => {
          throw new Error(privateDetail);
        }
      },
      {
        store: createStore({
          completeReset: vi.fn(async () => {
            throw new Error(privateDetail);
          })
        }),
        encodePassword: async () => PASSWORD_HASH
      }
    ];

    for (const dependencies of cases) {
      const error = await completePasswordReset(
        { token: TOKEN, password: PASSWORD },
        dependencies
      ).catch((caught: unknown) => caught);
      expect(error).toMatchObject({ code: "PASSWORD_RESET_OPERATION_FAILED" });
      expect(JSON.stringify(error)).not.toContain(privateDetail);
    }
  });
});
