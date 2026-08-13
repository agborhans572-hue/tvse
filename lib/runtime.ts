export type TvseRuntimeEnv = {
  DB?: D1Database;
  UPLOADS?: R2Bucket;
  ASSETS?: Fetcher;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  RESEND_WEBHOOK_SECRET?: string;
  APP_ENV?: "development" | "test" | "production";
  ALLOW_INSECURE_LOCAL_DEV?: string;
  APP_BASE_URL?: string;
  TVSE_ADMIN_EMAILS?: string;
  TRUST_OPENAI_AUTH_HEADERS?: string;
  TVSE_WHATSAPP_NUMBER?: string;
  TVSE_LINKEDIN_URL?: string;
  TVSE_INSTAGRAM_URL?: string;
  TVSE_FACEBOOK_URL?: string;
  OPERATIONS_API_URL?: string;
  OPERATIONS_ALLOWED_ORIGINS?: string;
  OPERATIONS_TOKEN_KID?: string;
  OPERATIONS_TOKEN_SECRET?: string;
  OPERATIONS_TOKEN_PREVIOUS_KID?: string;
  OPERATIONS_TOKEN_PREVIOUS_SECRET?: string;
  OPERATIONS_SERVICE_KID?: string;
  OPERATIONS_SERVICE_SECRET?: string;
  OPERATIONS_SERVICE_PREVIOUS_KID?: string;
  OPERATIONS_SERVICE_PREVIOUS_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_EXPECTED_HOSTNAME?: string;
  TAWK_PROPERTY_ID?: string;
  TAWK_WIDGET_ID?: string;
  OPERATIONS_PUBLIC_WRITE_PERCENT?: string;
};

type RuntimeGlobal = typeof globalThis & { __TVSE_RUNTIME_ENV__?: TvseRuntimeEnv };

export function installRuntimeEnv(value: TvseRuntimeEnv) {
  (globalThis as RuntimeGlobal).__TVSE_RUNTIME_ENV__ = value;
}

export const runtimeEnv = new Proxy({} as TvseRuntimeEnv, {
  get(_target, property: keyof TvseRuntimeEnv) {
    return (globalThis as RuntimeGlobal).__TVSE_RUNTIME_ENV__?.[property];
  },
});

export class RuntimeConfigurationError extends Error { readonly status=503; }

export function applicationEnvironment(): "development"|"test"|"production" {
  if (runtimeEnv.APP_ENV) return runtimeEnv.APP_ENV;
  return process.env.NODE_ENV === "development" ? "development" : process.env.NODE_ENV === "test" ? "test" : "production";
}

export function publicBaseUrl(request?: Request): string {
  const configured = runtimeEnv.APP_BASE_URL?.trim();
  if (configured) {
    let parsed: URL;
    try { parsed = new URL(configured); } catch { throw new RuntimeConfigurationError("APP_BASE_URL must be an absolute URL"); }
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new RuntimeConfigurationError("APP_BASE_URL must be a canonical origin without credentials, path, query, or fragment");
    if (applicationEnvironment() === "production" && parsed.protocol !== "https:") throw new RuntimeConfigurationError("APP_BASE_URL must use HTTPS in production");
    return parsed.origin;
  }
  if (applicationEnvironment() === "production") throw new RuntimeConfigurationError("APP_BASE_URL is required in production");
  return request ? new URL(request.url).origin : "https://tvse-travel.agborhans572.chatgpt.site";
}

export function isExactLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

export function insecureLocalDevelopmentAllowed(hostname?: string): boolean {
  if (applicationEnvironment() !== "development" || runtimeEnv.ALLOW_INSECURE_LOCAL_DEV !== "true") return false;
  const appHostname = new URL(publicBaseUrl()).hostname;
  return isExactLoopbackHostname(appHostname) && (!hostname || isExactLoopbackHostname(hostname));
}

export function operationsServiceKey(): { id: string; secret: string } {
  const id = runtimeEnv.OPERATIONS_SERVICE_KID?.trim() ?? "";
  const secret = runtimeEnv.OPERATIONS_SERVICE_SECRET ?? "";
  if (!/^[A-Za-z0-9._-]{1,64}$/u.test(id) || new TextEncoder().encode(secret).byteLength < 32) throw new RuntimeConfigurationError("Operations service authentication is not configured");
  return { id, secret };
}

export function operationsTokenKey(): { id: string; secret: string } {
  const id=runtimeEnv.OPERATIONS_TOKEN_KID?.trim()??"";
  const secret=runtimeEnv.OPERATIONS_TOKEN_SECRET??"";
  if(!/^[A-Za-z0-9._-]{1,64}$/u.test(id)||new TextEncoder().encode(secret).byteLength<32)throw new RuntimeConfigurationError("Operations token authentication is not configured");
  return{id,secret};
}

export function configuredAdminEmails(): string[] {
  return (runtimeEnv.TVSE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}
