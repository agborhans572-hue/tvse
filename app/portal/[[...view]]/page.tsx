import type { Metadata } from "next";
import { WorkspaceRoute } from "../../components/WorkspaceRoute";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Traveler workspace | TVSE" };
export default async function TravelerWorkspace({ params,searchParams }: { params: Promise<{ view?: string[] }>;searchParams:Promise<{q?:string;status?:string;cursor?:string}> }) { const [{ view },search] = await Promise.all([params,searchParams]); return <WorkspaceRoute area="portal" view={view?.[0] ?? ""} search={search} />; }
