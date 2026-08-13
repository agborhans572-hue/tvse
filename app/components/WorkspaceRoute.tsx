import { requirePageActor } from "../../lib/auth";
import { redirect } from "next/navigation";
import { dashboardData, listActivity, listApprovals, listBookings, listContent, listInvoices, listLeads, listNotifications, listOrganizations, listPartnerAssignments, listQuotes, listSupportTickets, listTripRequests, listUsers, organizationWorkspace, partnerOperationsDirectories, workspaceReports } from "../../lib/repository";
import { WorkspaceShell, type WorkspaceArea } from "./Workspace";
import { WorkspaceView, type WorkspacePayload } from "./WorkspaceView";
import { overviewFromOperations, reportsFromOperations, scaledListFromOperations } from "../../lib/operations-client";

export async function WorkspaceRoute({ area, view, search = {} }: { area: WorkspaceArea; view: string;search?:{q?:string;status?:string;cursor?:string} }) {
  const actor = await requirePageActor(area);
  if(area==="staff"&&!['owner','admin'].includes(actor.role)){const allowed:Record<string,string[]>={agent:["","leads","pipeline","quotes","bookings","companies","partners","support","reports","settings"],finance:["","finance","companies","reports","settings"],content:["","content","settings"]};if(!(allowed[actor.role]||[]).includes(view))redirect("/staff");}
  const data: WorkspacePayload = { requests:[], quotes:[], bookings:[], invoices:[], tickets:[], approvals:[], assignments:[] };
  const staff = area === "staff";
  const scaled=(resource:string,fallback:()=>Promise<Record<string,unknown>[]>)=>scaledListFromOperations(actor,resource,fallback,{q:search.q,status:search.status,cursor:search.cursor});
  if (!view) {const overview=await overviewFromOperations(actor);if(overview)data.overview=overview as WorkspacePayload["overview"];else Object.assign(data,await dashboardData(actor));}
  else if (["requests","pipeline"].includes(view)) data.requests = await scaled("requests",()=>listTripRequests(actor)) as WorkspacePayload["requests"];
  else if (view === "quotes") [data.quotes, data.requests] = await Promise.all([scaled("quotes",()=>listQuotes(actor)), staff ? scaled("requests",()=>listTripRequests(actor)) : Promise.resolve([])]) as [WorkspacePayload["quotes"], WorkspacePayload["requests"]];
  else if (view === "bookings") data.bookings = await scaled("bookings",()=>listBookings(actor)) as WorkspacePayload["bookings"];
  else if (["invoices","finance"].includes(view)) [data.invoices, data.bookings] = await Promise.all([scaled("invoices",()=>listInvoices(actor)), staff ? scaled("bookings",()=>listBookings(actor)) : Promise.resolve([])]) as [WorkspacePayload["invoices"], WorkspacePayload["bookings"]];
  else if (view === "support") [data.tickets, data.bookings] = await Promise.all([scaled("support",()=>listSupportTickets(actor)), staff ? Promise.resolve([]) : scaled("bookings",()=>listBookings(actor))]) as [WorkspacePayload["tickets"], WorkspacePayload["bookings"]];
  else if (view === "leads") data.leads = await scaled("leads",()=>listLeads(actor)) as WorkspacePayload["leads"];
  else if (view === "approvals") data.approvals = await scaled("approvals",()=>listApprovals(actor)) as WorkspacePayload["approvals"];
  else if (view === "assignments") data.assignments = await scaled("assignments",()=>listPartnerAssignments(actor)) as WorkspacePayload["assignments"];
  else if (view === "documents") [data.quotes, data.bookings, data.invoices] = await Promise.all([scaled("quotes",()=>listQuotes(actor)), scaled("bookings",()=>listBookings(actor)), scaled("invoices",()=>listInvoices(actor))]) as [WorkspacePayload["quotes"], WorkspacePayload["bookings"], WorkspacePayload["invoices"]];
  else if (["users","travelers"].includes(view)) {
    if (staff) [data.users, data.organizations] = await Promise.all([listUsers(actor), listOrganizations(actor)]) as [WorkspacePayload["users"], WorkspacePayload["organizations"]];
    else Object.assign(data, await organizationWorkspace(actor));
  } else if (view === "companies") data.organizations = await listOrganizations(actor) as WorkspacePayload["organizations"];
  else if (view === "partners") {
    const [directories, bookings, assignments] = await Promise.all([partnerOperationsDirectories(actor), listBookings(actor), listPartnerAssignments(actor)]);
    Object.assign(data, directories, { bookings, assignments });
  } else if (view === "content") data.content = await listContent(actor) as WorkspacePayload["content"];
  else if (view === "notifications") data.notifications = await listNotifications(actor) as WorkspacePayload["notifications"];
  else if (view === "audit") data.activity = await listActivity(actor) as WorkspacePayload["activity"];
  else if (view === "reports") data.report = ((await reportsFromOperations(actor))??await workspaceReports(actor)) as WorkspacePayload["report"];
  else if (["settings","profile"].includes(view) && (area === "business" || area === "partner")) Object.assign(data, await organizationWorkspace(actor));
  return <WorkspaceShell area={area} actor={actor} view={view}><WorkspaceView area={area} view={view} actor={actor} data={data} /></WorkspaceShell>;
}
