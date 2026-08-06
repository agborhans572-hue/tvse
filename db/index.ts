import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { runtimeEnv } from "../lib/runtime";

export function getDb() {
  if (!runtimeEnv.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(runtimeEnv.DB, { schema });
}

export function getD1(): D1Database {
  if (!runtimeEnv.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  return runtimeEnv.DB;
}

export function getUploads(): R2Bucket {
  if (!runtimeEnv.UPLOADS) throw new Error("Cloudflare R2 binding `UPLOADS` is unavailable.");
  return runtimeEnv.UPLOADS;
}
