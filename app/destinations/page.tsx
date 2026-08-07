import type { Metadata } from "next";
import { DestinationGrid, PublicHero } from "../components/PublicCatalog";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import { getPublishedDestinations } from "../../lib/public-content";

export const metadata: Metadata = { title: "Destinations | TVSE Travel", description: "Explore TVSE's curated destinations across Africa, the Indian Ocean and beyond.", alternates:{canonical:"/destinations"} };
export default async function DestinationsPage() { const destinations = await getPublishedDestinations(); return <main id="top" className="public-product-page"><SiteHeader /><PublicHero eyebrow="CURATED BY TVSE" title="Places worth traveling for." intro="Start with a place, then let us shape the pace, stays and details around you." action={{ label: "Plan a journey", href: "/plan-a-trip" }} /><section className="shell catalog-section"><DestinationGrid destinations={destinations} /></section><SiteFooter /></main>; }
