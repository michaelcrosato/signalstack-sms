import { describe, expect, it } from "vitest";
import {
  PLAN_QUOTAS,
  DEFAULT_PLAN_TIER,
  QuotaExceededError,
  getPlanLimits,
  checkContactQuota,
  checkMessageSegmentQuota,
  checkApiKeyQuota,
  checkSeatQuota,
  checkMediaStorageQuota
} from "@/lib/operations/entitlements";

describe("Plan Entitlements & Segment Quota Engine", () => {
  describe("getPlanLimits", () => {
    it("returns correct limits for each plan tier", () => {
      expect(getPlanLimits("community")).toEqual(PLAN_QUOTAS.community);
      expect(getPlanLimits("starter")).toEqual(PLAN_QUOTAS.starter);
      expect(getPlanLimits("pro")).toEqual(PLAN_QUOTAS.pro);
      expect(getPlanLimits("enterprise")).toEqual(PLAN_QUOTAS.enterprise);
    });

    it("falls back to default plan tier when tier is unknown", () => {
      expect(getPlanLimits("unknown-tier")).toEqual(PLAN_QUOTAS[DEFAULT_PLAN_TIER]);
      expect(getPlanLimits()).toEqual(PLAN_QUOTAS[DEFAULT_PLAN_TIER]);
    });
  });

  describe("checkContactQuota", () => {
    const limits = PLAN_QUOTAS.community; // max 100

    it("allows contact creation when under limit", () => {
      const result = checkContactQuota(50, 1, limits);
      expect(result.allowed).toBe(true);
      expect(result.current).toBe(50);
      expect(result.limit).toBe(100);
      expect(result.remaining).toBe(50);
    });

    it("allows contact creation up to exact limit", () => {
      const result = checkContactQuota(99, 1, limits);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });

    it("disallows contact creation when quota is exhausted", () => {
      const result = checkContactQuota(100, 1, limits);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("disallows bulk import exceeding limit", () => {
      const result = checkContactQuota(90, 15, limits);
      expect(result.allowed).toBe(false);
    });
  });

  describe("checkMessageSegmentQuota", () => {
    const limits = PLAN_QUOTAS.community; // max 500

    it("allows message segment enqueueing when under limit", () => {
      const result = checkMessageSegmentQuota(200, 1, limits);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(300);
    });

    it("allows multi-segment messages within limit", () => {
      const result = checkMessageSegmentQuota(495, 3, limits);
      expect(result.allowed).toBe(true);
    });

    it("blocks outbox enqueueing when monthly segment quota is exhausted", () => {
      const result = checkMessageSegmentQuota(500, 1, limits);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("blocks multi-segment message exceeding remaining quota", () => {
      const result = checkMessageSegmentQuota(498, 4, limits);
      expect(result.allowed).toBe(false);
    });
  });

  describe("checkApiKeyQuota", () => {
    const limits = PLAN_QUOTAS.community; // max 2

    it("allows key creation under limit", () => {
      const result = checkApiKeyQuota(1, 1, limits);
      expect(result.allowed).toBe(true);
    });

    it("disallows key creation when quota is exhausted", () => {
      const result = checkApiKeyQuota(2, 1, limits);
      expect(result.allowed).toBe(false);
    });
  });

  describe("checkSeatQuota", () => {
    const limits = PLAN_QUOTAS.community; // max 3

    it("allows seat invitation under limit", () => {
      const result = checkSeatQuota(2, 1, limits);
      expect(result.allowed).toBe(true);
    });

    it("disallows seat invitation when seat limit is reached", () => {
      const result = checkSeatQuota(3, 1, limits);
      expect(result.allowed).toBe(false);
    });
  });

  describe("checkMediaStorageQuota", () => {
    const limits = PLAN_QUOTAS.community; // max 100 MB

    it("allows media storage within quota", () => {
      const result = checkMediaStorageQuota(50 * 1024 * 1024, 10 * 1024 * 1024, limits);
      expect(result.allowed).toBe(true);
    });

    it("disallows media upload exceeding storage cap", () => {
      const result = checkMediaStorageQuota(95 * 1024 * 1024, 10 * 1024 * 1024, limits);
      expect(result.allowed).toBe(false);
    });
  });

  describe("QuotaExceededError", () => {
    it("instantiates with metric, current, limit, and descriptive message", () => {
      const error = new QuotaExceededError("contacts", 100, 100);
      expect(error.name).toBe("QuotaExceededError");
      expect(error.code).toBe("QUOTA_EXCEEDED");
      expect(error.metric).toBe("contacts");
      expect(error.current).toBe(100);
      expect(error.limit).toBe(100);
      expect(error.message).toContain("Plan quota exceeded for contacts: 100/100");
    });
  });
});
