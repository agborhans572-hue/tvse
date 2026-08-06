import Link from "next/link";
import { SiteFooter, SiteHeader } from "./components/SiteChrome";
export default function NotFound() { return <main id="top" className="not-found-page"><SiteHeader /><section><span>404 · OFF ROUTE</span><h1>This journey isn’t on the map.</h1><p>The page may have moved. Let’s get you somewhere more useful.</p><div><Link className="pill primary" href="/">Return home</Link><Link className="pill outline" href="/destinations">Explore destinations</Link></div><b aria-hidden="true">✈</b></section><SiteFooter /></main>; }
