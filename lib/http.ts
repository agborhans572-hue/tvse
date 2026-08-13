import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AuthError } from "./auth";
import { validationError } from "./validation";
import { HttpError } from "./request-security";
import { RuntimeConfigurationError } from "./runtime";
export { assertSameOrigin, HttpError, idempotencyKey, requireIdempotencyKey } from "./request-security";

export async function readBoundedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/u.test(declared) || Number(declared) > maxBytes)) throw new HttpError("The request body is too large", 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new HttpError("The request body is too large", 413);
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

export async function parseJson<T>(request: Request, schema: ZodType<T>, maxBytes = 64_000): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) throw new HttpError("Expected JSON request", 415);
  const bytes = await readBoundedBody(request, maxBytes);
  let body: unknown; try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new HttpError("Invalid JSON request", 400); }
  return schema.parse(body);
}

export async function parseFormData(request: Request, maxBytes: number): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) throw new HttpError("Expected multipart form data", 415);
  const body = await readBoundedBody(request, maxBytes);
  const formBody=Uint8Array.from(body).buffer;
  try { return await new Request(request.url, { method: "POST", headers: { "Content-Type": contentType }, body:formBody }).formData(); }
  catch { throw new HttpError("Invalid multipart request", 400); }
}

export function apiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json(validationError(error), { status: 422 });
  if (error instanceof AuthError || error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status, headers: error instanceof HttpError ? error.headers : undefined });
  if(error instanceof RuntimeConfigurationError)return NextResponse.json({error:"Security configuration is temporarily unavailable."},{status:error.status});
  const message = error instanceof Error ? error.message : "Unexpected request failure";
  const status = /not found/i.test(message) ? 404 : /permission|belong|assigned approver|access required/i.test(message) ? 403 : /invalid|cannot|must|only|exceed/i.test(message) ? 409 : 500;
  return NextResponse.json({ error: status === 500 ? "The request could not be completed." : message }, { status });
}
