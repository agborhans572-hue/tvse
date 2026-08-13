import type { Role } from "./travel";

export type OperationsAccessClaims = {
  sub: string;
  email: string;
  role: Role;
  organizationId: string | null;
  source: "magic_link" | "platform";
  authVersion: number;
  iss: "tvse-sites";
  aud: "tvse-operations";
  iat: number;
  exp: number;
  jti: string;
  kid: string;
};

const encoder = new TextEncoder();

function encodeBase64Url(value: Uint8Array | string): string {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): string {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)));
}

async function signature(input: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return encodeBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(input))));
}

export async function signOperationsAccessToken(
  claims: Omit<OperationsAccessClaims, "iss" | "aud" | "iat" | "exp" | "jti" | "kid">,
  options: { secret: string; kid: string; now?: number; ttlSeconds?: number },
): Promise<{ token: string; expiresAt: number }> {
  if (encoder.encode(options.secret).byteLength < 32) throw new Error("OPERATIONS_TOKEN_SECRET must be at least 32 bytes");
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const payload: OperationsAccessClaims = {
    ...claims,
    iss: "tvse-sites",
    aud: "tvse-operations",
    iat: now,
    exp: now + Math.min(options.ttlSeconds ?? 300, 300),
    jti: crypto.randomUUID(),
    kid: options.kid,
  };
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT", kid: options.kid }));
  const body = encodeBase64Url(JSON.stringify(payload));
  const input = `${header}.${body}`;
  return { token: `${input}.${await signature(input, options.secret)}`, expiresAt: payload.exp * 1000 };
}

export async function verifyOperationsAccessToken(
  token: string,
  keys: Record<string, string | undefined>,
  now = Math.floor(Date.now() / 1000),
): Promise<OperationsAccessClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed access token");
  const header = JSON.parse(decodeBase64Url(parts[0])) as { alg?: string; kid?: string };
  if (header.alg !== "HS256" || !header.kid) throw new Error("Unsupported access token");
  const secret = keys[header.kid];
  if (!secret || encoder.encode(secret).byteLength < 32) throw new Error("Unknown signing key");
  const expected = await signature(`${parts[0]}.${parts[1]}`, secret);
  if (!constantTimeEqual(expected, parts[2])) throw new Error("Invalid access token signature");
  const claims = JSON.parse(decodeBase64Url(parts[1])) as OperationsAccessClaims;
  if (claims.iss !== "tvse-sites" || claims.aud !== "tvse-operations" || claims.kid !== header.kid) throw new Error("Invalid access token audience");
  if (!Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) || claims.iat > now + 30 || claims.exp <= now || claims.exp - claims.iat > 300) throw new Error("Expired access token");
  return claims;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
