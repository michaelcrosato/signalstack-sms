import { isIP } from "node:net";

const MAX_ENDPOINT_URL_BYTES = 2_048;
const MAX_DNS_ANSWERS = 16;

export type CustomerWebhookDnsAnswer = Readonly<{
  address: string;
  family: 4 | 6;
}>;

export type CustomerWebhookAddressClassification = Readonly<{
  safe: boolean;
  family: 4 | 6 | null;
  reason:
    | "public"
    | "invalid"
    | "unspecified"
    | "private"
    | "loopback"
    | "link-local"
    | "shared"
    | "documentation"
    | "benchmark"
    | "multicast"
    | "transition"
    | "reserved";
}>;

export class CustomerWebhookEndpointSecurityError extends Error {
  readonly code: "INVALID_URL" | "UNSAFE_HOSTNAME" | "DNS_NO_ANSWERS" | "DNS_TOO_MANY_ANSWERS" | "UNSAFE_ADDRESS";

  constructor(code: CustomerWebhookEndpointSecurityError["code"], message: string) {
    super(message);
    this.name = "CustomerWebhookEndpointSecurityError";
    this.code = code;
  }
}

/**
 * Canonicalizes only internet HTTPS endpoints. DNS safety is intentionally checked again at every delivery.
 */
export function canonicalizeCustomerWebhookEndpointUrl(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    Buffer.byteLength(value, "utf8") > MAX_ENDPOINT_URL_BYTES ||
    hasUnsafeCharacter(value) ||
    value.includes("\\")
  ) {
    throw endpointError("INVALID_URL", "Customer webhook endpoint URL is invalid.");
  }

  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw endpointError("INVALID_URL", "Customer webhook endpoint URL is invalid.");
  }

  if (
    endpoint.protocol !== "https:" ||
    endpoint.username !== "" ||
    endpoint.password !== "" ||
    endpoint.search !== "" ||
    endpoint.hash !== "" ||
    value.includes("?") ||
    value.includes("#")
  ) {
    throw endpointError("INVALID_URL", "Customer webhook endpoint must be an HTTPS URL without credentials, query, or fragment.");
  }

  const hostname = endpoint.hostname.toLowerCase();
  assertSafeHostname(hostname);
  endpoint.hostname = hostname;
  return endpoint.toString();
}

export function classifyCustomerWebhookAddress(address: string): CustomerWebhookAddressClassification {
  const family = isIP(address);
  if (family === 4) {
    return classifyIpv4(address);
  }
  if (family === 6) {
    return classifyIpv6(address);
  }
  return classification(false, null, "invalid");
}

/** Fail closed if even one resolver answer is non-public; a mixed answer set can otherwise enable rebinding. */
export function assertSafeCustomerWebhookDnsAnswers(
  hostname: string,
  answers: readonly CustomerWebhookDnsAnswer[]
): readonly CustomerWebhookDnsAnswer[] {
  assertSafeHostname(hostname.toLowerCase());
  if (answers.length === 0) {
    throw endpointError("DNS_NO_ANSWERS", "Customer webhook endpoint DNS returned no addresses.");
  }
  if (answers.length > MAX_DNS_ANSWERS) {
    throw endpointError("DNS_TOO_MANY_ANSWERS", "Customer webhook endpoint DNS returned too many addresses.");
  }

  const vetted: CustomerWebhookDnsAnswer[] = [];
  const seen = new Set<string>();
  for (const answer of answers) {
    const result = classifyCustomerWebhookAddress(answer.address);
    if (!result.safe || result.family !== answer.family) {
      throw endpointError("UNSAFE_ADDRESS", "Customer webhook endpoint resolved to a non-public address.");
    }
    const key = `${answer.family}:${answer.address.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      vetted.push(Object.freeze({ address: answer.address, family: answer.family }));
    }
  }
  return Object.freeze(vetted);
}

function assertSafeHostname(hostname: string): void {
  const unwrapped = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  if (
    hostname.length === 0 ||
    hostname.length > 253 ||
    hostname.endsWith(".") ||
    isIP(unwrapped) !== 0 ||
    !hostname.includes(".")
  ) {
    throw endpointError("UNSAFE_HOSTNAME", "Customer webhook endpoint hostname is not a public DNS name.");
  }

  const labels = hostname.split(".");
  if (labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw endpointError("UNSAFE_HOSTNAME", "Customer webhook endpoint hostname is not a public DNS name.");
  }

  const reservedSuffixes = [
    ".localhost",
    ".local",
    ".localdomain",
    ".internal",
    ".home",
    ".lan",
    ".corp",
    ".invalid",
    ".test",
    ".example"
  ];
  if (
    reservedSuffixes.some((suffix) => hostname.endsWith(suffix)) ||
    hostname === "metadata.google.internal" ||
    hostname.endsWith(".metadata.google.internal")
  ) {
    throw endpointError("UNSAFE_HOSTNAME", "Customer webhook endpoint hostname is reserved or local.");
  }
}

function classifyIpv4(address: string): CustomerWebhookAddressClassification {
  const value = ipv4ToNumber(address);
  if (value === null) {
    return classification(false, 4, "invalid");
  }

  const blocked: ReadonlyArray<readonly [number, number, CustomerWebhookAddressClassification["reason"]]> = [
    [ipv4Literal(0, 0, 0, 0), 8, "unspecified"],
    [ipv4Literal(10, 0, 0, 0), 8, "private"],
    [ipv4Literal(100, 64, 0, 0), 10, "shared"],
    [ipv4Literal(127, 0, 0, 0), 8, "loopback"],
    [ipv4Literal(169, 254, 0, 0), 16, "link-local"],
    [ipv4Literal(172, 16, 0, 0), 12, "private"],
    [ipv4Literal(192, 0, 0, 0), 24, "reserved"],
    [ipv4Literal(192, 0, 2, 0), 24, "documentation"],
    [ipv4Literal(192, 31, 196, 0), 24, "reserved"],
    [ipv4Literal(192, 52, 193, 0), 24, "reserved"],
    [ipv4Literal(192, 88, 99, 0), 24, "transition"],
    [ipv4Literal(192, 168, 0, 0), 16, "private"],
    [ipv4Literal(192, 175, 48, 0), 24, "reserved"],
    [ipv4Literal(198, 18, 0, 0), 15, "benchmark"],
    [ipv4Literal(198, 51, 100, 0), 24, "documentation"],
    [ipv4Literal(203, 0, 113, 0), 24, "documentation"],
    [ipv4Literal(224, 0, 0, 0), 4, "multicast"],
    [ipv4Literal(240, 0, 0, 0), 4, "reserved"]
  ];
  for (const [network, prefix, reason] of blocked) {
    if (ipv4InCidr(value, network, prefix)) {
      return classification(false, 4, reason);
    }
  }
  return classification(true, 4, "public");
}

function classifyIpv6(address: string): CustomerWebhookAddressClassification {
  const value = ipv6ToBigInt(address);
  if (value === null) {
    return classification(false, 6, "invalid");
  }
  if (value === 0n) {
    return classification(false, 6, "unspecified");
  }
  if (value === 1n) {
    return classification(false, 6, "loopback");
  }

  const blocked: ReadonlyArray<readonly [bigint, number, CustomerWebhookAddressClassification["reason"]]> = [
    [ipv6Literal("64:ff9b::"), 96, "transition"],
    [ipv6Literal("100::"), 64, "reserved"],
    [ipv6Literal("2001::"), 23, "reserved"],
    [ipv6Literal("2001:db8::"), 32, "documentation"],
    [ipv6Literal("2002::"), 16, "transition"],
    [ipv6Literal("3fff::"), 20, "documentation"],
    [ipv6Literal("5f00::"), 16, "reserved"],
    [ipv6Literal("fc00::"), 7, "private"],
    [ipv6Literal("fe80::"), 10, "link-local"],
    [ipv6Literal("ff00::"), 8, "multicast"]
  ];
  for (const [network, prefix, reason] of blocked) {
    if (ipv6InCidr(value, network, prefix)) {
      return classification(false, 6, reason);
    }
  }

  // Native IPv6 public unicast currently lives in 2000::/3. Reject transition and future-use space by default.
  return ipv6InCidr(value, ipv6Literal("2000::"), 3)
    ? classification(true, 6, "public")
    : classification(false, 6, "reserved");
}

function ipv4ToNumber(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part))) {
    return null;
  }
  const octets = parts.map(Number);
  if (octets.some((octet) => octet > 255)) {
    return null;
  }
  return ipv4Literal(octets[0], octets[1], octets[2], octets[3]);
}

function ipv4Literal(a: number, b: number, c: number, d: number): number {
  return (((a * 256 + b) * 256 + c) * 256 + d) >>> 0;
}

function ipv4InCidr(value: number, network: number, prefix: number): boolean {
  const divisor = 2 ** (32 - prefix);
  return Math.floor(value / divisor) === Math.floor(network / divisor);
}

function ipv6ToBigInt(address: string): bigint | null {
  if (isIP(address) !== 6 || address.includes("%")) {
    return null;
  }

  let normalized = address.toLowerCase();
  const ipv4Match = /(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(normalized);
  if (ipv4Match) {
    const ipv4 = ipv4ToNumber(ipv4Match[1]);
    if (ipv4 === null) {
      return null;
    }
    normalized = `${normalized.slice(0, ipv4Match.index + (normalized[ipv4Match.index] === ":" ? 1 : 0))}${(
      (ipv4 >>> 16) & 0xffff
    ).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) {
    return null;
  }
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) {
    return null;
  }
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[a-f0-9]{1,4}$/.test(group))) {
    return null;
  }
  return groups.reduce((result, group) => (result << 16n) | BigInt(`0x${group}`), 0n);
}

function ipv6Literal(address: string): bigint {
  const parsed = ipv6ToBigInt(address);
  if (parsed === null) {
    throw new Error("Invalid internal IPv6 literal.");
  }
  return parsed;
}

function ipv6InCidr(value: bigint, network: bigint, prefix: number): boolean {
  const shift = BigInt(128 - prefix);
  return value >> shift === network >> shift;
}

function classification(
  safe: boolean,
  family: CustomerWebhookAddressClassification["family"],
  reason: CustomerWebhookAddressClassification["reason"]
): CustomerWebhookAddressClassification {
  return Object.freeze({ safe, family, reason });
}

function hasUnsafeCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 32 || codePoint === 127;
  });
}

function endpointError(
  code: CustomerWebhookEndpointSecurityError["code"],
  message: string
): CustomerWebhookEndpointSecurityError {
  return new CustomerWebhookEndpointSecurityError(code, message);
}
