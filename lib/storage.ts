import { getD1, getUploads } from "../db";
import { createId } from "./ids";
import type { Actor } from "./travel";
import { isInternalRole } from "./travel";
import { can } from "./travel";
import { canAccessResource } from "./authorization";
import { signatureMatches } from "./file-signatures";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 10 * 1024 * 1024;
export type UploadEntityType = "profile" | "booking" | "support" | "content";

async function assertEntityAccess(actor: Actor, entityType: UploadEntityType, entityId: string, visibility: "private" | "public") {
  if (entityType === "profile") {
    if (entityId !== actor.id || visibility !== "private") throw new Error("Profile uploads must belong to your account");
    return;
  }
  if (entityType === "content") {
    if (!can(actor.role, "manage_content")) throw new Error("Content permission required");
    const row=await getD1().prepare("SELECT id FROM destinations WHERE id=? UNION ALL SELECT id FROM packages WHERE id=? UNION ALL SELECT id FROM content_entries WHERE id=? LIMIT 1").bind(entityId,entityId,entityId).first();
    if(!row)throw new Error("Content record not found");
    return;
  }
  const db = getD1();
  if (entityType === "booking") {
    if (isInternalRole(actor.role) && !can(actor.role, "manage_travel")) throw new Error("Booking upload permission required");
    const row = isInternalRole(actor.role)
      ? await db.prepare("SELECT id FROM bookings WHERE id=?").bind(entityId).first()
      : await db.prepare("SELECT id FROM bookings WHERE id=? AND (user_id=? OR organization_id=?)").bind(entityId, actor.id, actor.organizationId ?? "").first();
    if (!row) throw new Error("Booking not found");
    return;
  }
  if (isInternalRole(actor.role) && !can(actor.role, "manage_travel")) throw new Error("Support upload permission required");
  const row = isInternalRole(actor.role)
    ? await db.prepare("SELECT id FROM support_tickets WHERE id=?").bind(entityId).first()
    : await db.prepare("SELECT id FROM support_tickets WHERE id=? AND (user_id=? OR organization_id=?)").bind(entityId, actor.id, actor.organizationId ?? "").first();
  if (!row) throw new Error("Support request not found");
}

export async function saveUpload(file: File, actor: Actor, entityType: UploadEntityType, entityId: string, visibility: "private" | "public" = "private") {
  if (!allowedTypes.has(file.type)) throw new Error("Only JPG, PNG, WebP, and PDF files are accepted");
  if (visibility === "public" && !imageTypes.has(file.type)) throw new Error("Only validated images may be public");
  if (file.size <= 0 || file.size > maxBytes) throw new Error("Files must be 10 MB or smaller");
  await assertEntityAccess(actor, entityType, entityId, visibility);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!signatureMatches(file.type, bytes)) throw new Error("The file contents do not match the selected file type");
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "upload"; const id = createId("ast"); const key = `uploads/${entityType}/${entityId}/${id}-${cleanName}`;
  await getUploads().put(key, bytes, { httpMetadata: { contentType: file.type, contentDisposition: `${visibility === "private" ? "attachment" : "inline"}; filename="${cleanName}"` } });
  try {
    await getD1().prepare("INSERT INTO media_assets (id, owner_user_id, entity_type, entity_id, r2_key, filename, content_type, size_bytes, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, actor.id, entityType, entityId, key, cleanName, file.type, file.size, visibility, Date.now()).run();
  } catch (error) {
    await getUploads().delete(key);
    throw error;
  }
  return { id, filename: cleanName, contentType: file.type, sizeBytes: file.size, visibility };
}

export async function getAsset(id: string, actor: Actor | null) {
  const db = getD1(); const asset = await db.prepare("SELECT * FROM media_assets WHERE id=?").bind(id).first<Record<string, unknown>>();
  if (!asset) return null;
  const publicImage = asset.visibility === "public" && imageTypes.has(String(asset.content_type));
  let permitted = publicImage || Boolean(actor && asset.owner_user_id === actor.id);
  if (!permitted && actor && asset.entity_type === "content") permitted = canAccessResource(actor.role, "content");
  if (!permitted && actor && asset.entity_type === "booking" && isInternalRole(actor.role)) permitted = canAccessResource(actor.role, "bookings");
  if (!permitted && actor && asset.entity_type === "support" && isInternalRole(actor.role)) permitted = canAccessResource(actor.role, "support");
  if (!permitted && actor && asset.entity_type === "booking") {
    const owned = await db.prepare("SELECT id FROM bookings WHERE id=? AND (user_id=? OR organization_id=?)").bind(asset.entity_id, actor.id, actor.organizationId ?? "").first(); permitted = Boolean(owned);
  }
  if (!permitted && actor && asset.entity_type === "support") {
    const owned = await db.prepare("SELECT id FROM support_tickets WHERE id=? AND (user_id=? OR organization_id=?)").bind(asset.entity_id, actor.id, actor.organizationId ?? "").first(); permitted = Boolean(owned);
  }
  if (!permitted) return null;
  const object = await getUploads().get(String(asset.r2_key)); if (!object) return null;
  return { asset, object };
}
