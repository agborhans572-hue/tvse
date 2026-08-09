import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import { PublicHero, TripPlanner } from "../components/PublicCatalog";

export const metadata: Metadata = {
  title: "Make an enquiry | TVSE Travel",
  description: "Enquire about flights, accommodation, transfers, car rental, safaris, delivery, corporate travel and events.",
  alternates: { canonical: "/plan-a-trip" },
};

export default async function PlanTripPage({ searchParams }: { searchParams: Promise<{ destination?: string; destination_slug?: string; package?: string; service?: string }> }) {
  const { destination = "", destination_slug: destinationSlug, package: packageSlug, service = "" } = await searchParams;
  return <main id="top" className="plan-trip-page">
    <SiteHeader />
    <PublicHero
      eyebrow="TVSE CONCIERGE"
      title="One enquiry. Every service, expertly arranged."
      intro="Choose what you need and share the essentials. Our Nairobi team will connect the right specialists into one clear response."
    />
    <section className="shell planner-section is-primary">
      <TripPlanner defaultDestination={destination} defaultService={service} destinationSlug={destinationSlug} packageSlug={packageSlug} />
    </section>
    <SiteFooter />
  </main>;
}
