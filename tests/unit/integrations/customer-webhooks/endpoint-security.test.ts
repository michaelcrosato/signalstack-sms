import { describe, expect, it } from "vitest";
import {
  assertSafeCustomerWebhookDnsAnswers,
  canonicalizeCustomerWebhookEndpointUrl,
  classifyCustomerWebhookAddress
} from "@/lib/integrations/customer-webhooks/endpoint-security";

describe("customer webhook endpoint URL security", () => {
  it("canonicalizes a strict public HTTPS endpoint without changing its authority", () => {
    expect(canonicalizeCustomerWebhookEndpointUrl("https://Hooks.Example.COM:443/a/../v1/events")).toBe(
      "https://hooks.example.com/v1/events"
    );
    expect(canonicalizeCustomerWebhookEndpointUrl("https://hooks.example.com")).toBe(
      "https://hooks.example.com/"
    );
  });

  it.each([
    "http://hooks.example.com/events",
    "https://user:password@hooks.example.com/events",
    "https://hooks.example.com/events?token=secret",
    "https://hooks.example.com/events?",
    "https://hooks.example.com/events#fragment",
    "https://127.0.0.1/events",
    "https://[::1]/events",
    "https://localhost/events",
    "https://webhook/events",
    "https://metadata.google.internal/events",
    "https://hooks.service.local/events",
    "https://hooks.example.com./events",
    "https://bad_host.example.com/events",
    " https://hooks.example.com/events",
    "https:\\hooks.example.com\\events"
  ])("rejects unsafe or ambiguous URL %s", (endpointUrl) => {
    expect(() => canonicalizeCustomerWebhookEndpointUrl(endpointUrl)).toThrow(/endpoint|hostname|HTTPS/i);
  });
});

describe("customer webhook DNS address security", () => {
  it.each([
    ["93.184.216.34", 4],
    ["8.8.8.8", 4],
    ["2606:4700:4700::1111", 6],
    ["2001:4860:4860::8888", 6]
  ] as const)("accepts public unicast %s", (address, family) => {
    expect(classifyCustomerWebhookAddress(address)).toEqual({ safe: true, family, reason: "public" });
  });

  it.each([
    ["0.0.0.0", "unspecified"],
    ["10.0.0.1", "private"],
    ["100.64.0.1", "shared"],
    ["127.0.0.1", "loopback"],
    ["169.254.169.254", "link-local"],
    ["172.31.255.255", "private"],
    ["192.168.1.1", "private"],
    ["192.0.2.1", "documentation"],
    ["198.18.0.1", "benchmark"],
    ["198.51.100.1", "documentation"],
    ["203.0.113.1", "documentation"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "reserved"],
    ["::", "unspecified"],
    ["::1", "loopback"],
    ["::ffff:192.168.1.1", "reserved"],
    ["fc00::1", "private"],
    ["fe80::1", "link-local"],
    ["ff02::1", "multicast"],
    ["2001:db8::1", "documentation"],
    ["2002::1", "transition"]
  ] as const)("rejects non-public address %s", (address, reason) => {
    expect(classifyCustomerWebhookAddress(address)).toMatchObject({ safe: false, reason });
  });

  it("rejects the entire DNS result when one answer is unsafe or has a forged family", () => {
    expect(() =>
      assertSafeCustomerWebhookDnsAnswers("hooks.example.com", [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.1", family: 4 }
      ])
    ).toThrow("non-public");
    expect(() =>
      assertSafeCustomerWebhookDnsAnswers("hooks.example.com", [
        { address: "93.184.216.34", family: 6 }
      ])
    ).toThrow("non-public");
    expect(() => assertSafeCustomerWebhookDnsAnswers("hooks.example.com", [])).toThrow("no addresses");
  });

  it("deduplicates a bounded all-public DNS result without mutating caller evidence", () => {
    const answers = [
      { address: "93.184.216.34", family: 4 as const },
      { address: "93.184.216.34", family: 4 as const },
      { address: "2606:4700:4700::1111", family: 6 as const }
    ];
    const vetted = assertSafeCustomerWebhookDnsAnswers("hooks.example.com", answers);

    expect(vetted).toHaveLength(2);
    expect(answers).toHaveLength(3);
    expect(Object.isFrozen(vetted)).toBe(true);
  });
});
