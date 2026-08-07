import type { Metadata } from "next";
import { PackageGrid, PublicHero } from "../components/PublicCatalog";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import { getPublishedPackages } from "../../lib/public-content";

export const metadata: Metadata = { title: "Travel packages | TVSE", description: "Curated TVSE journeys ready to personalize.", alternates:{canonical:"/packages"} };
export default async function PackagesPage() { const packages = await getPublishedPackages(); return <main id="top" className="public-product-page"><SiteHeader /><PublicHero eyebrow="READY TO PERSONALIZE" title="Journeys with a head start." intro="Each itinerary is a considered beginning—not a rigid package. Adjust the dates, pace, stays and moments with a TVSE specialist." action={{ label: "Build from scratch", href: "/plan-a-trip" }} /><section className="shell catalog-section"><PackageGrid packages={packages} /></section><SiteFooter /></main>; }
