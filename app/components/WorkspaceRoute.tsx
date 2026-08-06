import { requirePageActor } from "../../lib/auth";
import { dashboardData, listActivity, listContent, listNotifications, listOrganizations, listSuppliers, listUsers, organizationWorkspace } from "../../lib/repository";
import { WorkspaceShell, type WorkspaceArea } from "./Workspace";
import { WorkspaceView, type WorkspacePayload } from "./WorkspaceView";

export async function WorkspaceRoute({ area, view }: { area: WorkspaceArea; view: string }) {
  const actor = await requirePageActor(area); const base = await dashboardData(actor); const data: WorkspacePayload = { ...base };
  if (area === "staff") {
    const [users, organizations, suppliers, content, notifications, activity] = await Promise.all([listUsers(actor), listOrganizations(actor), listSuppliers(actor), listContent(actor), listNotifications(actor), listActivity(actor)]);
    Object.assign(data, { users, organizations, suppliers, content, notifications, activity });
  }
  if (area === "business" || area === "partner") Object.assign(data, await organizationWorkspace(actor));
  return <WorkspaceShell area={area} actor={actor} view={view}><WorkspaceView area={area} view={view} actor={actor} data={data} /></WorkspaceShell>;
}
