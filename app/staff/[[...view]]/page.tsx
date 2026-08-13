import type { Metadata } from "next";
import { WorkspaceRoute } from "../../components/WorkspaceRoute";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "TVSE operations" };
export default async function StaffWorkspace({ params,searchParams }: { params: Promise<{ view?: string[] }>;searchParams:Promise<{q?:string;status?:string;cursor?:string}> }) { const [{ view },search] = await Promise.all([params,searchParams]); return <WorkspaceRoute area="staff" view={view?.[0] ?? ""} search={search} />; }
