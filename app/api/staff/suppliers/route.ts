import { NextResponse } from "next/server";
import { authorize, getActor } from "../../../../lib/auth";
import { apiError, assertSameOrigin, parseJson } from "../../../../lib/http";
import { createSupplier, listSuppliers } from "../../../../lib/repository";
import { supplierSchema } from "../../../../lib/validation";

export async function GET() { try { const actor = authorize(await getActor(), ["owner", "admin", "agent"]); return NextResponse.json({ data: await listSuppliers(actor) }); } catch (error) { return apiError(error); } }
export async function POST(request: Request) { try { assertSameOrigin(request); const actor = authorize(await getActor(), ["owner", "admin", "agent"]); const input = await parseJson(request, supplierSchema); return NextResponse.json({ data: await createSupplier(input, actor) }, { status: 201 }); } catch (error) { return apiError(error); } }
