import type { OperationsAccessClaims } from "../../../lib/operations-token";

export type ShardNumber = 0 | 1 | 2 | 3;
export type JobState = "pending" | "queued" | "running" | "retryable" | "completed" | "dead";
export type JobType = "email" | "pdf" | "receipt" | "itinerary" | "webhook" | "archive" | "cleanup" | "change_event";

export type JobMessage = {
  id: string;
  shard: ShardNumber;
  tenantKey: string;
  type: JobType;
  retryCount?: number;
};

export type Env = {
  CORE_DB: D1Database;
  OPS_0: D1Database;
  OPS_1: D1Database;
  OPS_2: D1Database;
  OPS_3: D1Database;
  UPLOADS: R2Bucket;
  JOBS: Queue<JobMessage>;
  JOBS_DLQ: Queue<JobMessage>;
  ROUTING_CACHE: KVNamespace;
  RATE_LIMITER: DurableObjectNamespace;
  DOCUMENT_NUMBERS: DurableObjectNamespace;
  ALLOWED_ORIGINS: string;
  TOKEN_CURRENT_KID: string;
  TOKEN_CURRENT_SECRET: string;
  TOKEN_PREVIOUS_KID?: string;
  TOKEN_PREVIOUS_SECRET?: string;
  OPERATIONS_SERVICE_KID: string;
  OPERATIONS_SERVICE_SECRET: string;
  OPERATIONS_SERVICE_PREVIOUS_KID?: string;
  OPERATIONS_SERVICE_PREVIOUS_SECRET?: string;
  CURSOR_SECRET: string;
  UPLOAD_TOKEN_SECRET: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  ARCHIVE_RETENTION_DAYS?: string;
  V2_FORCE_CORE_READS?: string;
  MIGRATION_ADMIN_TOKEN?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_EXPECTED_HOSTNAME?: string;
  ALLOW_INSECURE_LOCAL_DEV?: string;
};

export type RequestContext = {
  requestId: string;
  startedAt: number;
  actor: OperationsAccessClaims;
  tenantKey: string;
  shard: ShardNumber;
};

export type TenantRoute = {
  tenant_key: string;
  shard: ShardNumber;
  read_mode: "core" | "shadow" | "shard";
  mirror_writes: number;
};

export type ListCursor = {
  version: 1;
  createdAt: number;
  id: string;
  shard?: ShardNumber;
  positions?: Partial<Record<ShardNumber, { createdAt: number; id: string }>>;
};
