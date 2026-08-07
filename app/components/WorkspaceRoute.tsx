import { requirePageActor } from "../../lib/auth";
import { redirect } from "next/navigation";
import { dashboardData, listActivity, listContent, listLeads, listNotifications, listOrganizations, listSuppliers, listUsers, organizationWorkspace } from "../../lib/repository";
import { WorkspaceShell, type WorkspaceArea } from "./Workspace";
import { WorkspaceView, type WorkspacePayload } from "./WorkspaceView";

export async function WorkspaceRoute({ area, view }: { area: WorkspaceArea; view: string }) {
  const actor = await requirePageActor(area);
  if(area==="staff"&&!['owner','admin'].includes(actor.role)){const allowed:Record<string,string[]>={agent:["","leads","pipeline","quotes","bookings","companies","partners","support","reports","settings"],finance:["","finance","companies","reports","settings"],content:["","content","settings"]};if(!(allowed[actor.role]||[]).includes(view))redirect("/staff");}
  const base = await dashboardData(actor); const data: WorkspacePayload = {
    requests:base.requests as WorkspacePayload["requests"],quotes:base.quotes as WorkspacePayload["quotes"],bookings:base.bookings as WorkspacePayload["bookings"],invoices:base.invoices as WorkspacePayload["invoices"],tickets:base.tickets as WorkspacePayload["tickets"],approvals:base.approvals as WorkspacePayload["approvals"],assignments:base.assignments as WorkspacePayload["assignments"],
  };
  if (area === "staff") {
    const [users, organizations, suppliers, content, notifications, activity, leads] = await Promise.all([listUsers(actor), listOrganizations(actor), listSuppliers(actor), listContent(actor), listNotifications(actor), listActivity(actor), listLeads(actor)]);
    Object.assign(data, { users, organizations, suppliers, content, notifications, activity, leads });
  }
  if (area === "business" || area === "partner") Object.assign(data, await organizationWorkspace(actor));
  return <WorkspaceShell area={area} actor={actor} view={view}><WorkspaceView area={area} view={view} actor={actor} data={data} /></WorkspaceShell>;
}
