import type { Metadata } from "next";
import { WorkspaceRoute } from "../../components/WorkspaceRoute";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Traveler workspace | TVSE" };
export default async function TravelerWorkspace({ params }: { params: Promise<{ view?: string[] }> }) { const { view } = await params; return <WorkspaceRoute area="portal" view={view?.[0] ?? ""} />; }
