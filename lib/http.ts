import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AuthError } from "./auth";
import { validationError } from "./validation";

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new HttpError("Expected JSON request", 415);
  let body: unknown; try { body = await request.json(); } catch { throw new HttpError("Invalid JSON request", 400); }
  return schema.parse(body);
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new HttpError("Cross-origin request rejected", 403);
}

export function apiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json(validationError(error), { status: 422 });
  if (error instanceof AuthError || error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  const message = error instanceof Error ? error.message : "Unexpected request failure";
  const status = /not found/i.test(message) ? 404 : /permission|belong|assigned approver|access required/i.test(message) ? 403 : /invalid|cannot|must|only|exceed/i.test(message) ? 409 : 500;
  return NextResponse.json({ error: status === 500 ? "The request could not be completed." : message }, { status });
}

export class HttpError extends Error { constructor(message: string, public status: number) { super(message); } }
