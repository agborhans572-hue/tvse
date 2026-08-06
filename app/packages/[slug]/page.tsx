import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter, SiteHeader } from "../../components/SiteChrome";
import { packageCatalog } from "../../../lib/catalog";
import { getPublishedPackage } from "../../../lib/public-content";
import { formatMoney } from "../../../lib/travel";

export function generateStaticParams() { return packageCatalog.map((item) => ({ slug: item.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const item = await getPublishedPackage((await params).slug);
  return item ? { title: `${item.title} | TVSE`, description: item.summary } : {};
}

export default async function PackagePage({ params }: { params: Promise<{ slug: string }> }) {
  const item = await getPublishedPackage((await params).slug);
  if (!item) notFound();
  return <main id="top" className="package-detail-page">
    <SiteHeader />
    <section className="package-detail-hero shell-wide"><Image src={item.image} alt="" fill unoptimized priority sizes="100vw" /><div className="package-detail-card"><p>{item.durationDays} DAYS · FROM {formatMoney(item.fromPriceMinor, item.currency)}</p><h1>{item.title}</h1><span>{item.summary}</span><Link className="pill primary" href={`/plan-a-trip?destination=${encodeURIComponent(item.title)}`}>Personalize this journey <b>→</b></Link></div></section>
    <section className="shell package-detail-copy section"><div><p className="campaign-kicker">THE JOURNEY</p><h2>Considered from arrival to the final goodbye.</h2><p>{item.description}</p></div><div className="package-inclusions"><article><h3>Included</h3>{item.inclusions.map((line) => <p key={line}><span>✓</span>{line}</p>)}</article><article><h3>Not included</h3>{item.exclusions.map((line) => <p key={line}><span>—</span>{line}</p>)}</article></div></section>
    <section className="package-next"><div className="shell"><h2>Make the dates, stays and pace yours.</h2><Link className="pill white" href="/plan-a-trip">Start with this itinerary <span>→</span></Link></div></section>
    <SiteFooter />
  </main>;
}
