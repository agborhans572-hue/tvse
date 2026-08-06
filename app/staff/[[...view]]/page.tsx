import type { Metadata } from "next";
import { WorkspaceRoute } from "../../components/WorkspaceRoute";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "TVSE operations" };
export default async function StaffWorkspace({ params }: { params: Promise<{ view?: string[] }> }) { const { view } = await params; return <WorkspaceRoute area="staff" view={view?.[0] ?? ""} />; }
