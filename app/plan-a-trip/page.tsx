import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import { PublicHero, TripPlanner } from "../components/PublicCatalog";

export const metadata: Metadata = { title: "Plan a trip | TVSE Travel", description: "Share your travel idea and receive a personal TVSE proposal." };
export default async function PlanTripPage({ searchParams }: { searchParams: Promise<{ destination?: string }> }) { const { destination = "" } = await searchParams; return <main id="top" className="plan-trip-page"><SiteHeader /><PublicHero eyebrow="YOUR JOURNEY STARTS HERE" title="Tell us the idea. We’ll shape the journey." intro="A few useful details are enough for a TVSE specialist to begin." /><section className="shell planner-section is-primary"><TripPlanner defaultDestination={destination} /></section><SiteFooter /></main>; }
