import type { Metadata } from "next";
import { WorkspaceRoute } from "../../components/WorkspaceRoute";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Partner connect | TVSE" };
export default async function PartnerWorkspace({ params }: { params: Promise<{ view?: string[] }> }) { const { view } = await params; return <WorkspaceRoute area="partner" view={view?.[0] ?? ""} />; }
