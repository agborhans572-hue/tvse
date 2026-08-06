import { NextResponse } from "next/server";
import { getActor, authorize } from "../../../lib/auth";
import { apiError, assertSameOrigin, parseJson } from "../../../lib/http";
import { listContent, upsertContent } from "../../../lib/repository";
import { contentSchema } from "../../../lib/validation";

export async function GET() { try { const actor = await getActor(); return NextResponse.json({ data: await listContent(actor) }); } catch (error) { return apiError(error); } }
export async function POST(request: Request) { try { assertSameOrigin(request); const actor = authorize(await getActor(), ["owner", "admin", "content"]); const input = await parseJson(request, contentSchema); return NextResponse.json({ data: await upsertContent(input, actor) }, { status: 201 }); } catch (error) { return apiError(error); } }
