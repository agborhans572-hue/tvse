import { getActor } from "../../../../lib/auth";
import { getAsset } from "../../../../lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const result = await getAsset(id, await getActor()); if (!result) return new Response("Not found", { status: 404 });
  const asset = result.asset; const object = result.object;
  return new Response(object.body, { headers: { "Content-Type": String(asset.content_type), "Content-Disposition": `${asset.visibility === "public" ? "inline" : "attachment"}; filename="${String(asset.filename).replaceAll('"', '')}"`, ETag: object.httpEtag, "Cache-Control": asset.visibility === "public" ? "public, max-age=3600" : "private, no-store" } });
}
