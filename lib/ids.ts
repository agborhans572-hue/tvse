import { getD1 } from "../db";
import { randomToken } from "./security";
export { randomToken, sha256 } from "./security";

export function createId(prefix: string): string { return `${prefix}_${randomToken(12)}`; }

export async function nextDocumentNumber(kind: "REQ" | "Q" | "B" | "INV" | "RCT" | "TKT"): Promise<string> {
  const db = getD1();
  const year = new Date().getUTCFullYear();
  const sequenceId = `${kind}:${year}`;
  const now = Date.now();
  const result = await db.prepare(`
    INSERT INTO sequences (id, current_value, updated_at)
    VALUES (?, 1, ?)
    ON CONFLICT(id) DO UPDATE SET current_value = current_value + 1, updated_at = excluded.updated_at
    RETURNING current_value
  `).bind(sequenceId, now).first<{ current_value: number }>();
  if (!result) throw new Error("Could not allocate document number");
  return `TVSE-${kind}-${year}-${String(result.current_value).padStart(5, "0")}`;
}
