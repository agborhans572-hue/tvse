import Link from "next/link";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
export default function AccessDeniedPage() { return <main id="top" className="not-found-page"><SiteHeader /><section><span>SECURE TVSE WORKSPACE</span><h1>This account doesn’t have access.</h1><p>Open the workspace connected to your invitation, or ask a TVSE administrator to update your role.</p><div><Link className="pill primary" href="/">Return home</Link><Link className="pill outline" href="/support">Get support</Link></div></section><SiteFooter /></main>; }
