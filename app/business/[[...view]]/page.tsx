import type { Metadata } from "next";
import { WorkspaceRoute } from "../../components/WorkspaceRoute";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Business account | TVSE" };
export default async function BusinessWorkspace({ params }: { params: Promise<{ view?: string[] }> }) { const { view } = await params; return <WorkspaceRoute area="business" view={view?.[0] ?? ""} />; }
