import { describe, expect, it } from "vitest";
import {
  applyDemoSafeRuntimeDefaults,
  assertDemoSafeDefaults,
  envDefaults,
  localDatabaseUrl,
} from "@/lib/env/defaults";

describe("env defaults", () => {
  describe("applyDemoSafeRuntimeDefaults", () => {
    it("should apply defaults when env is empty", () => {
      const env: Record<string, string | undefined> = {};
      applyDemoSafeRuntimeDefaults(env);

      expect(env.DEMO_MODE).toBe("true");
      expect(env.LIVE_MESSAGING_ENABLED).toBe("false");
      expect(env.LIVE_BILLING_ENABLED).toBe("false");
      expect(env.MESSAGING_PROVIDER).toBe("dummy");
      expect(env.AI_PROVIDER).toBe("fake");
      expect(env.DATABASE_URL).toBe(localDatabaseUrl);
    });

    it("should not override existing values", () => {
      const env: Record<string, string | undefined> = {
        DEMO_MODE: "false",
        LIVE_MESSAGING_ENABLED: "true",
        DATABASE_URL: "postgresql://custom:5432/db",
      };
      applyDemoSafeRuntimeDefaults(env);

      expect(env.DEMO_MODE).toBe("false");
      expect(env.LIVE_MESSAGING_ENABLED).toBe("true");
      // Other defaults should be applied
      expect(env.LIVE_BILLING_ENABLED).toBe("false");
      expect(env.MESSAGING_PROVIDER).toBe("dummy");
      expect(env.AI_PROVIDER).toBe("fake");
      expect(env.DATABASE_URL).toBe("postgresql://custom:5432/db");
    });
  });

  describe("assertDemoSafeDefaults", () => {
    it("should not throw when defaults match exactly", () => {
      const env: Record<string, string | undefined> = { ...envDefaults };
      expect(() => assertDemoSafeDefaults(env)).not.toThrow();
    });

    it("should throw when a default is missing", () => {
      const env: Record<string, string | undefined> = { ...envDefaults };
      delete env.DEMO_MODE;
      expect(() => assertDemoSafeDefaults(env)).toThrow("DEMO_MODE must default to true");
    });

    it("should throw when a default does not match", () => {
      const env: Record<string, string | undefined> = { ...envDefaults, DEMO_MODE: "false" };
      expect(() => assertDemoSafeDefaults(env)).toThrow("DEMO_MODE must default to true");
    });

    it("should not throw if there are extra properties", () => {
      const env: Record<string, string | undefined> = { ...envDefaults, EXTRA_PROP: "value" };
      expect(() => assertDemoSafeDefaults(env)).not.toThrow();
    });
  });
});
