import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter, SiteHeader } from "../../components/SiteChrome";
import { TripPlanner } from "../../components/PublicCatalog";
import { destinationCatalog } from "../../../lib/catalog";
import { getPublishedDestination, getPublishedPackages } from "../../../lib/public-content";
import { formatMoney } from "../../../lib/travel";

export function generateStaticParams() { return destinationCatalog.map((item) => ({ slug: item.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const item = await getPublishedDestination((await params).slug);
  return item ? { title: `${item.name} | TVSE Destinations`, description: item.summary, alternates:{canonical:`/destinations/${item.slug}`}, openGraph:{title:`${item.name} | TVSE Destinations`,description:item.summary,images:[item.image]} } : {};
}

export default async function DestinationPage({ params }: { params: Promise<{ slug: string }> }) {
  const item = await getPublishedDestination((await params).slug);
  if (!item) notFound();
  const packages = await getPublishedPackages(item.slug);
  return <main id="top" className="destination-detail-page">
    <SiteHeader />
    <section className="destination-detail-hero">
      <Image src={item.image} alt={`${item.name}, ${item.country}`} fill unoptimized priority sizes="100vw" />
      <div className="destination-detail-shade" />
      <div className="shell"><p>{item.region} · {item.country}</p><h1>{item.name}</h1><span>{item.summary}</span></div>
    </section>
    <section className="shell destination-story section">
      <div><p className="campaign-kicker">WHY {item.name.toUpperCase()}</p><h2>A journey with room to become yours.</h2></div>
      <div><p>{item.description}</p><dl><div><dt>Best time</dt><dd>{item.bestTime}</dd></div><div><dt>TVSE highlights</dt><dd>{item.highlights.join(" · ")}</dd></div></dl></div>
    </section>
    {packages.length > 0 && <section className="destination-package-band"><div className="shell"><p className="campaign-kicker">A PLACE TO START</p><h2>{packages[0].title}</h2><p>{packages[0].description}</p><strong>From {formatMoney(packages[0].fromPriceMinor, packages[0].currency)}</strong><Link className="pill white" href={`/packages/${packages[0].slug}`}>See the journey <span>→</span></Link></div></section>}
    <section className="shell planner-section"><div className="planner-heading"><p className="campaign-kicker">MAKE IT PERSONAL</p><h2>Plan {item.name} with TVSE.</h2><p>Share the starting point. We will handle the possibilities.</p></div><TripPlanner defaultDestination={item.name} destinationSlug={item.slug} /></section>
    <SiteFooter />
  </main>;
}
