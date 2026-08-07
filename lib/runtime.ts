export type TvseRuntimeEnv = {
  DB?: D1Database;
  UPLOADS?: R2Bucket;
  ASSETS?: Fetcher;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  RESEND_WEBHOOK_SECRET?: string;
  APP_BASE_URL?: string;
  TVSE_ADMIN_EMAILS?: string;
  TVSE_WHATSAPP_NUMBER?: string;
  TVSE_LINKEDIN_URL?: string;
  TVSE_INSTAGRAM_URL?: string;
  TVSE_FACEBOOK_URL?: string;
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

export function publicBaseUrl(request?: Request): string {
  if (runtimeEnv.APP_BASE_URL) return runtimeEnv.APP_BASE_URL.replace(/\/$/, "");
  return request ? new URL(request.url).origin : "https://tvse-travel.agborhans572.chatgpt.site";
}

export function configuredAdminEmails(): string[] {
  return (runtimeEnv.TVSE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}
