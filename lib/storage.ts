import { getD1, getUploads } from "../db";
import { createId } from "./ids";
import type { Actor } from "./travel";
import { isInternalRole } from "./travel";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const maxBytes = 10 * 1024 * 1024;

export async function saveUpload(file: File, actor: Actor, entityType: string, entityId: string, visibility: "private" | "public" = "private") {
  if (!allowedTypes.has(file.type)) throw new Error("Only JPG, PNG, WebP, PDF and DOCX files are accepted");
  if (file.size <= 0 || file.size > maxBytes) throw new Error("Files must be 10 MB or smaller");
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120); const id = createId("ast"); const key = `uploads/${entityType}/${entityId}/${id}-${cleanName}`;
  await getUploads().put(key, file.stream(), { httpMetadata: { contentType: file.type, contentDisposition: `${visibility === "private" ? "attachment" : "inline"}; filename="${cleanName}"` } });
  await getD1().prepare("INSERT INTO media_assets (id, owner_user_id, entity_type, entity_id, r2_key, filename, content_type, size_bytes, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, actor.id, entityType, entityId, key, cleanName, file.type, file.size, visibility, Date.now()).run();
  return { id, filename: cleanName, contentType: file.type, sizeBytes: file.size, visibility };
}

export async function getAsset(id: string, actor: Actor | null) {
  const db = getD1(); const asset = await db.prepare("SELECT * FROM media_assets WHERE id=?").bind(id).first<Record<string, unknown>>();
  if (!asset) return null;
  let permitted = asset.visibility === "public" || Boolean(actor && (asset.owner_user_id === actor.id || isInternalRole(actor.role)));
  if (!permitted && actor && asset.entity_type === "booking") {
    const owned = await db.prepare("SELECT id FROM bookings WHERE id=? AND (user_id=? OR organization_id=?)").bind(asset.entity_id, actor.id, actor.organizationId ?? "").first(); permitted = Boolean(owned);
  }
  if (!permitted) return null;
  const object = await getUploads().get(String(asset.r2_key)); if (!object) return null;
  return { asset, object };
}
