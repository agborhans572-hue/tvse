import { getActor } from "../../../../lib/auth";
import { getAsset } from "../../../../lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const result = await getAsset(id, await getActor()); if (!result) return new Response("Not found", { status: 404 });
  const asset = result.asset; const object = result.object;
  const contentType=String(asset.content_type);const isImage=contentType.startsWith("image/");const isPublic=asset.visibility==="public"&&isImage;const filename=String(asset.filename).replace(/[^A-Za-z0-9._-]/gu,"-").slice(0,120)||"download";
  const headers=new Headers({"Content-Type":contentType,"Content-Disposition":`${isPublic?"inline":"attachment"}; filename="${filename}"`,ETag:object.httpEtag,"Cache-Control":isPublic?"public, max-age=3600":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"});
  if(!isImage)headers.set("Content-Security-Policy","sandbox; default-src 'none'; frame-ancestors 'none'");
  return new Response(object.body,{headers});
}
