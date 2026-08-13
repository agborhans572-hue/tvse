import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import { PublicHero } from "../components/PublicCatalog";
import { LiveChatButton } from "../components/TawkLiveChat";

export const metadata: Metadata = {
  title: "Traveler support | TVSE",
  description: "Get help with an active TVSE trip, booking, invoice or travel request.",
  alternates: { canonical: "/support" },
};

export default function SupportPage() {
  return (
    <main id="top" className="information-page support-public-page">
      <SiteHeader />
      <PublicHero
        eyebrow="TVSE SUPPORT"
        title="Help that stays with the journey."
        intro="For an active booking, use your traveler workspace so our team can see the trip details immediately."
      />
      <section className="shell support-choice-grid">
        <article className="support-chat-card">
          <span>LIVE CHAT</span>
          <h2>Talk to our travel team</h2>
          <p>Open a private chat for quick questions about a journey, booking or new travel plan.</p>
          <LiveChatButton />
        </article>
        <article>
          <span>ACTIVE TRIP</span>
          <h2>I need help now</h2>
          <p>Open a support request linked to your booking, itinerary and traveler details.</p>
          <Link className="pill primary" href="/login/traveler?return_to=/portal/support">Open traveler support <b>&rarr;</b></Link>
        </article>
        <article>
          <span>NEW OR UPCOMING</span>
          <h2>I have a planning question</h2>
          <p>Speak with TVSE about dates, destinations, business travel or a new request.</p>
          <Link className="pill outline" href="/contact">Contact TVSE <b>&rarr;</b></Link>
        </article>
        <article>
          <span>URGENT</span>
          <h2>Use your itinerary contact</h2>
          <p>Your confirmed itinerary includes the appropriate emergency support details for the services you are using.</p>
          <a className="pill outline" href="mailto:hello@tvsetravel.com">Email TVSE <b>&rarr;</b></a>
        </article>
      </section>
      <SiteFooter />
    </main>
  );
}
