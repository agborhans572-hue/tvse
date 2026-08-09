import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { chatGPTSignOutPath } from "../chatgpt-auth";
import type { Actor } from "../../lib/travel";

export type WorkspaceArea = "portal" | "business" | "partner" | "staff";
const navigation: Record<WorkspaceArea, Array<[string, string, string]>> = {
  portal: [["Overview","","⌂"],["Requests","requests","↗"],["Quotes","quotes","◇"],["Bookings","bookings","✈"],["Documents","documents","▤"],["Invoices","invoices","$"],["Support","support","?"],["Profile","profile","○"]],
  business: [["Overview","","⌂"],["Travelers","travelers","◎"],["Requests","requests","↗"],["Approvals","approvals","✓"],["Invoices","invoices","$"],["Reports","reports","▥"],["Settings","settings","⚙"]],
  partner: [["Overview","","⌂"],["Assignments","assignments","↗"],["Documents","documents","▤"],["Invoices","invoices","$"],["Profile","profile","○"]],
  staff: [["Overview","","⌂"],["Lead inbox","leads","◎"],["Request pipeline","pipeline","↗"],["Quote builder","quotes","◇"],["Bookings","bookings","✈"],["Companies","companies","▦"],["Partners","partners","◎"],["Finance","finance","$"],["Support inbox","support","?"],["Email outbox","notifications","✉"],["Content studio","content","✦"],["Reports","reports","▥"],["Users & roles","users","○"],["Audit history","audit","≡"],["Settings","settings","⚙"]],
};

export function WorkspaceShell({ area, actor, view, children }: { area: WorkspaceArea; actor: Actor; view: string; children: ReactNode }) {
  const label = area === "portal" ? "Traveler workspace" : area === "business" ? "Business account" : area === "partner" ? "Partner connect" : "TVSE operations";
  const staffAllowed:Record<Actor["role"],string[]|null>={owner:null,admin:null,agent:["","leads","pipeline","quotes","bookings","companies","partners","support","reports","settings"],finance:["","finance","companies","reports","settings"],content:["","content","settings"],traveler:null,corporate_requester:null,corporate_approver:null,partner:null};
  const visibleNavigation=area==="staff"&&staffAllowed[actor.role]?navigation.staff.filter(([,path])=>staffAllowed[actor.role]!.includes(path)):navigation[area];
  return <main className={`workspace workspace-${area}`}><aside className="workspace-sidebar"><Link href="/" className="workspace-logo" aria-label="TVSE Travel Agency Ltd home"><span><Image src="/tvse-travel-globe-logo.png" alt="" fill unoptimized sizes="180px" /></span></Link><p>{label}</p><nav>{visibleNavigation.map(([name,path,icon])=><Link key={name} className={view === path ? "active" : ""} href={`/${area}${path ? `/${path}` : ""}`}><span>{icon}</span>{name}</Link>)}</nav><div className="workspace-user"><span>{(actor.fullName || actor.email).slice(0,1).toUpperCase()}</span><div><strong>{actor.fullName || actor.email.split("@")[0]}</strong><small>{actor.role.replaceAll("_"," ")}</small></div></div>{actor.source === "platform" ? <Link className="workspace-signout" href={chatGPTSignOutPath("/")}>Sign out</Link> : <form method="post" action="/api/auth/logout"><button className="workspace-signout" type="submit">Sign out</button></form>}</aside><section className="workspace-main"><header><div><small>{label}</small><h1>{visibleNavigation.find(([,path])=>path===view)?.[0] ?? "Overview"}</h1></div><div className="workspace-header-actions"><Link href="/support">Help</Link><Link className="pill primary compact" href="/plan-a-trip">New request</Link></div></header>{children}</section></main>;
}
