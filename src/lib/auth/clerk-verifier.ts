const cryptoObj = globalThis.crypto;

export interface Jwk {
  kty: string;
  use?: string;
  alg?: string;
  kid?: string;
  n?: string;
  e?: string;
  [key: string]: any;
}

export interface JwksResponse {
  keys: Jwk[];
}

interface JwtHeader {
  alg: string;
  typ: string;
  kid: string;
}

interface JwtPayload {
  iss: string;
  sub: string;
  exp: number;
  nbf?: number;
  iat?: number;
  org_id?: string;
  org_role?: string;
  [key: string]: any;
}

// Simple cache for JWKS
const jwksCache = new Map<string, { keys: Jwk[]; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function base64urlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (base64.length % 4)) % 4;
  const padded = base64 + "=".repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function verifyClerkToken(
  token: string,
  options: { jwks?: JwksResponse; expectedIssuer?: string } = {}
): Promise<{ clerkUserId: string; clerkOrgId?: string | null }> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  let header: JwtHeader;
  let payload: JwtPayload;
  try {
    header = JSON.parse(atob(headerB64.replace(/-/g, "+").replace(/_/g, "/")));
    payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    throw new Error("Failed to parse token headers or payload");
  }

  if (header.alg !== "RS256") {
    throw new Error("Unsupported algorithm");
  }

  // Validate expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error("Token expired");
  }

  if (payload.nbf && payload.nbf > now) {
    throw new Error("Token not yet valid");
  }

  // Validate issuer if expected
  if (options.expectedIssuer && payload.iss !== options.expectedIssuer) {
    throw new Error("Invalid issuer");
  }

  // Resolve JWKS
  let keys: Jwk[] = [];
  if (options.jwks) {
    keys = options.jwks.keys;
  } else {
    const jwksUrl = `${payload.iss}/.well-known/jwks.json`;
    const cached = jwksCache.get(jwksUrl);
    if (cached && cached.expiresAt > Date.now()) {
      keys = cached.keys;
    } else {
      const res = await fetch(jwksUrl);
      if (!res.ok) {
        throw new Error(`Failed to fetch JWKS from ${jwksUrl}`);
      }
      const data = (await res.json()) as JwksResponse;
      keys = data.keys;
      jwksCache.set(jwksUrl, { keys, expiresAt: Date.now() + CACHE_TTL_MS });
    }
  }

  // Find the matching key
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    throw new Error("Matching key not found in JWKS");
  }

  // Import key
  const cryptoKey = await cryptoObj.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["verify"]
  );

  // Verify signature
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64urlToBytes(signatureB64);

  const isValid = await cryptoObj.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    signature as any,
    data
  );

  if (!isValid) {
    throw new Error("Invalid signature");
  }

  return {
    clerkUserId: payload.sub,
    clerkOrgId: payload.org_id || null,
  };
}
