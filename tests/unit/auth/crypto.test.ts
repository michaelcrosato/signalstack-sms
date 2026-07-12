import { describe, expect, it } from "vitest";
import {
  createOpaqueToken,
  evaluatePasswordPolicy,
  hashLocalSessionToken,
  hashOpaqueToken,
  hashPassword,
  normalizeEmail,
  passwordHashNeedsRehash,
  safeEqualSecret,
  verifyPassword
} from "@/lib/auth/crypto";

describe("built-in auth crypto", () => {
  it("normalizes email identity keys without changing stored display policy", () => {
    expect(normalizeEmail("  Owner@Example.COM ")).toBe("owner@example.com");
  });

  it("enforces length, blank, and known-default password policy", () => {
    expect(evaluatePasswordPolicy("short")).toEqual({ valid: false, reason: "too-short" });
    expect(evaluatePasswordPolicy("            ")).toEqual({ valid: false, reason: "blank" });
    expect(evaluatePasswordPolicy("password1234")).toEqual({ valid: false, reason: "known-default" });
    expect(evaluatePasswordPolicy("x".repeat(129))).toEqual({ valid: false, reason: "too-long" });
    expect(evaluatePasswordPolicy("correct horse battery staple")).toEqual({ valid: true });
  });

  it("hashes and verifies passwords with unique salts", async () => {
    const password = "correct horse battery staple";
    const first = await hashPassword(password);
    const second = await hashPassword(password);

    expect(first).toMatch(/^scrypt\$v=1\$N=32768,r=8,p=1\$/);
    expect(first).not.toContain(password);
    expect(first).not.toBe(second);
    await expect(verifyPassword(password, first)).resolves.toBe(true);
    await expect(verifyPassword("incorrect horse battery staple", first)).resolves.toBe(false);
    expect(passwordHashNeedsRehash(first)).toBe(false);
  });

  it("rejects malformed or unsupported hashes before password derivation", async () => {
    await expect(verifyPassword("correct horse battery staple", "not-a-password-hash")).resolves.toBe(false);
    await expect(
      verifyPassword(
        "correct horse battery staple",
        "scrypt$v=1$N=1048576,r=8,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      )
    ).resolves.toBe(false);
    expect(passwordHashNeedsRehash("not-a-password-hash")).toBe(true);
  });

  it("rejects passwords outside the bounded verification input", async () => {
    await expect(verifyPassword("x".repeat(129), "not-a-password-hash")).resolves.toBe(false);
    await expect(hashPassword("password1234")).rejects.toThrow("known-default");
  });

  it("generates purpose-bound opaque tokens and stores only deterministic hashes", () => {
    const first = createOpaqueToken("session");
    const second = createOpaqueToken("session");

    expect(first.token).toMatch(/^ss_session_[A-Za-z0-9_-]{43}$/);
    expect(first.tokenHash).toBe(hashOpaqueToken(first.token));
    expect(first.tokenHash).not.toContain(first.token);
    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).not.toBe(second.tokenHash);
  });

  it("bounds malformed opaque token input", () => {
    expect(() => hashOpaqueToken("too-short")).toThrow("invalid shape");
    expect(() => hashOpaqueToken("x".repeat(193))).toThrow("invalid shape");
    expect(() => hashOpaqueToken("ss_session_invalid value with spaces")).toThrow("invalid shape");
  });

  it("domain-separates session lookup hashes and makes key rotation invalidate lookup evidence", () => {
    const token = createOpaqueToken("session").token;
    const firstKey = "session-hmac-key-a-0123456789abcdef";
    const secondKey = "session-hmac-key-b-0123456789abcdef";
    const firstHash = hashLocalSessionToken(token, firstKey);

    expect(firstHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(firstHash).not.toBe(hashOpaqueToken(token));
    expect(hashLocalSessionToken(token, firstKey)).toBe(firstHash);
    expect(hashLocalSessionToken(token, secondKey)).not.toBe(firstHash);
    expect(() => hashLocalSessionToken(token, "too-short")).toThrow("invalid shape");
  });

  it("compares bootstrap and operator secrets without length-sensitive byte comparison", () => {
    expect(safeEqualSecret("a-secret-value", "a-secret-value")).toBe(true);
    expect(safeEqualSecret("a-secret-value", "a-different-value")).toBe(false);
    expect(safeEqualSecret("short", "a-much-longer-secret-value")).toBe(false);
    expect(safeEqualSecret("x".repeat(193), "x".repeat(193))).toBe(false);
  });
});
