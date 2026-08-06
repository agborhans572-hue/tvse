import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import { PublicHero } from "../components/PublicCatalog";
import { faqItems } from "../../lib/catalog";

export const metadata: Metadata = { title: "Frequently asked questions | TVSE", description: "Answers about planning, quotes, payments, changes and travel support with TVSE." };
export default function FaqPage() { return <main id="top" className="information-page"><SiteHeader /><PublicHero eyebrow="USEFUL ANSWERS" title="A little clarity before takeoff." intro="The practical questions travelers and companies ask most often." /><section className="shell faq-list">{faqItems.map(([question,answer],index)=><details key={question} open={index===0}><summary><span>{String(index+1).padStart(2,"0")}</span>{question}<b>+</b></summary><p>{answer}</p></details>)}</section><section className="info-cta"><div className="shell"><h2>Still wondering?</h2><p>A real TVSE specialist is ready to help.</p><Link className="pill white" href="/contact">Ask TVSE <span>→</span></Link></div></section><SiteFooter /></main>; }
