"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { ResourceCard, TvsePage } from "../page-data";
import { SiteFooter, SiteHeader } from "./SiteChrome";

const pageKey = (path: string) => path.replace(/^\//, "").replaceAll("/", "-");

export function ReferencePage({ page }: { page: TvsePage }) {
  if (page.path === "/resources") return <ResourcesPage page={page} />;
  if (page.path === "/resources/blog") return <BlogPage page={page} />;
  if (page.path === "/resources/guides") return <GuidesPage page={page} />;
  if (page.path === "/contact") return <ContactPage page={page} />;
  if (page.variant === "portal") return <PortalPage page={page} />;
  return <CampaignPage page={page} />;
}

function Frame({ children, className }: { children: ReactNode; className: string }) {
  return <main id="top" className={`reference-root ${className}`}><SiteHeader />{children}<SiteFooter /></main>;
}

function ArrowButton({ href = "#page-content", children, outline = false }: { href?: string; children: ReactNode; outline?: boolean }) {
  return <Link className={`pill ${outline ? "outline" : "primary"}`} href={href}>{children}<span aria-hidden="true">→</span></Link>;
}

function FlyingPlanes({ accent = false }: { accent?: boolean }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;
  return (
    <div className={`reference-flight-layer${accent ? " is-accent" : ""}`} aria-hidden="true">
      <motion.div className="reference-plane plane-a" animate={{ x: ["-18vw", "115vw"], y: [120, -145], rotate: [-12, 10], opacity: [0, 1, 1, 0] }} transition={{ duration: 7.2, repeat: Infinity, repeatDelay: 1.1, ease: "easeInOut" }}><i />✈</motion.div>
      <motion.div className="reference-plane plane-b" animate={{ x: ["108vw", "-18vw"], y: [-30, 105], rotate: [190, 172], opacity: [0, .75, .75, 0] }} transition={{ duration: 9.4, repeat: Infinity, repeatDelay: 2, ease: "easeInOut", delay: 1.4 }}><i />✈</motion.div>
    </div>
  );
}

function CampaignPage({ page }: { page: TvsePage }) {
  const key = pageKey(page.path);
  const reduceMotion = useReducedMotion();
  return (
    <Frame className={`campaign-page layout-${key}`}>
      <section className="campaign-hero shell">
        <p className="campaign-kicker">{page.eyebrow}</p>
        <h1>{page.heroTitle}</h1>
        <p className="campaign-lead">{page.intro}</p>
        <ArrowButton>{page.ctaLabel}</ArrowButton>
      </section>
      <section className="campaign-stage shell-wide" aria-label={`${page.eyebrow} overview`}>
        <FlyingPlanes accent={page.tone === "orange"} />
        <CampaignVisual page={page} />
      </section>
      <section id="page-content" className="campaign-intro shell section">
        <div>
          <p className="campaign-kicker">{page.sectionEyebrow}</p>
          <h2>{page.sectionTitle}</h2>
        </div>
        <div className="campaign-intro-copy">
          <p>{page.sectionText}</p>
          <strong>{page.metric}</strong><span>{page.metricLabel}</span>
        </div>
      </section>
      <section className="campaign-feature-band">
        <div className="shell section">
          <div className="campaign-section-title"><span>What TVSE brings together</span><h2>{sectionHeading(page.path)}</h2></div>
          <div className="campaign-feature-grid">
            {page.features.map((feature, index) => (
              <motion.article key={feature.title} initial={reduceMotion ? false : { y: 35, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} viewport={{ once: true, amount: .3 }} transition={{ duration: .5, delay: index * .08 }}>
                <span>{String(index + 1).padStart(2, "0")}</span><h3>{feature.title}</h3><p>{feature.text}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>
      <CampaignEndcap page={page} />
    </Frame>
  );
}

function sectionHeading(path: string) {
  const headings: Record<string, string> = {
    "/solutions/booking-trip-management": "The whole trip, beautifully connected.",
    "/solutions/program-payment-insights": "From scattered data to decisive action.",
    "/solutions/meetings-events": "Every guest. Every detail. One remarkable moment.",
    "/solutions/consulting": "Strategy that earns its seat at the table.",
    "/technology/platform": "One workspace. Many ways to move.",
    "/technology/marketplace": "Specialists that extend what your program can do.",
    "/technology/apis-data": "Built for the systems behind the journey.",
  };
  return headings[path] ?? "Travel designed around real people.";
}

function CampaignVisual({ page }: { page: TvsePage }) {
  const key = pageKey(page.path);
  if (key.includes("booking")) return <div className="campaign-visual booking-visual"><VisualImage src={page.heroImage} /><div className="booking-map"><span>NBO</span><i /><b>✈</b><span>CPT</span></div><div className="booking-ticket"><small>TVSE JOURNEY</small><strong>Nairobi → Cape Town</strong><span>All details confirmed</span></div></div>;
  if (key.includes("insights")) return <div className="campaign-visual insight-visual"><div className="insight-person"><VisualImage src={page.heroImage} /></div><div className="insight-board"><span className="board-label">TVSE Intelligence</span><h3>Travel program overview</h3><div className="insight-stats"><b><em>84%</em>In policy</b><b><em>18%</em>Savings found</b><b><em>126</em>Active trips</b></div><div className="bar-chart">{[44,68,52,86,63,91,72].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div></div><div className="analyst-card"><b>AI travel analyst</b><span>Show the routes with the best saving opportunity.</span></div></div>;
  if (key.includes("meetings")) return <div className="campaign-visual meetings-visual"><VisualImage src={page.heroImage} /><div className="event-date"><small>TVSE EVENTS</small><strong>Leadership Summit</strong><span>120 guests · 3 days · 1 seamless plan</span></div><div className="event-ribbon"><i /><i /><i /></div></div>;
  if (key.includes("consulting")) return <div className="campaign-visual consulting-visual"><VisualImage src={page.heroImage} /><div className="consulting-lines"><i /><i /><i /></div><div className="consulting-score"><span>Program opportunity</span><strong>+24%</strong><small>measurable value identified</small></div></div>;
  if (key.includes("platform")) return <div className="campaign-visual platform-visual"><div className="platform-card"><span>CONTENT</span><strong>Regional and global choice</strong><i>126 live routes</i></div><div className="platform-card featured"><span>CONTROL CENTER</span><strong>Every active journey</strong><div className="route-mini"><b>NBO</b><i /><em>✈</em><b>DXB</b></div></div><div className="platform-card"><span>CONNECTED</span><strong>Tools that work together</strong><i>Approvals · Support · Insight</i></div></div>;
  if (key.includes("marketplace")) return <div className="campaign-visual marketplace-visual"><div className="marketplace-track"><span>PAYMENTS</span><span>TRAVEL RISK</span><span>VISA</span><span>MOBILITY</span><span>WELLNESS</span></div><div className="partner-cards">{["SafeRoute", "VisaFlow", "Move Africa", "TripPay", "StayWell", "CloudSIM"].map((name, i) => <div key={name}><b>{String(i + 1).padStart(2,"0")}</b><strong>{name}</strong><span>TVSE verified</span></div>)}</div></div>;
  return <div className="campaign-visual developer-visual"><VisualImage src={page.heroImage} /><div className="developer-lines"><i /><i /><i /></div><div className="code-window"><span><i /> <i /> <i /></span><pre>{`GET /v1/journeys\n{\n  "traveler": "connected",\n  "status": "ready"\n}`}</pre></div><div className="api-chip">API · DATA · WEBHOOKS</div></div>;
}

function VisualImage({ src }: { src: string }) { return <Image src={src} alt="" fill unoptimized sizes="100vw" />; }

function CampaignEndcap({ page }: { page: TvsePage }) {
  const key = pageKey(page.path);
  return <section className={`campaign-endcap endcap-${key}`}><div className="shell"><p>TVSE TRAVEL · NAIROBI TO THE WORLD</p><h2>{endcapHeading(page.path)}</h2><ArrowButton href="/contact">Start a conversation</ArrowButton></div></section>;
}

function endcapHeading(path: string) {
  if (path.includes("booking")) return "A better trip begins before takeoff.";
  if (path.includes("insights")) return "See the signal. Shape the next move.";
  if (path.includes("meetings")) return "Let the occasion feel effortless.";
  if (path.includes("consulting")) return "Turn ambition into a travel program that performs.";
  if (path.includes("marketplace")) return "Add the right capability at the right moment.";
  if (path.includes("apis")) return "Connect travel to the way your business works.";
  return "Bring every journey into one clear view.";
}

function ResourcesPage({ page }: { page: TvsePage }) {
  return <Frame className="editorial-page resources-layout"><section className="editorial-head shell"><h1>Business travel resources</h1><p>{page.intro}</p></section><section className="resource-listing shell"><h2>Latest insights, guides and stories</h2><label className="resource-select">Choose resource type<select aria-label="Choose resource type"><option>All resources</option><option>Destination intelligence</option><option>Business travel</option><option>How-to guides</option></select></label><CardGrid cards={page.cards ?? []} /></section><EditorialCTA /></Frame>;
}

function BlogPage({ page }: { page: TvsePage }) {
  const cards = page.cards ?? [];
  return <Frame className="editorial-page blog-layout"><section className="blog-shell shell"><header><h1>Blog</h1><p>{page.intro}</p></header><div className="blog-feature-grid">{cards.slice(0,2).map((card, i) => <article className={`blog-feature blog-feature-${i+1}`} key={card.title}>{i === 1 && <div className="blog-image"><Image src={card.image} alt="" fill unoptimized sizes="40vw" /></div>}<div><span>{card.label}</span><h2>{card.title}</h2><time>August {6-i}, 2026</time><p>{card.text}</p><Link href="/contact">Read more »</Link></div></article>)}<aside><h2>More stories</h2>{cards.slice(2,6).map(card => <Link key={card.title} href="/contact">{card.title}</Link>)}</aside></div><h2 className="more-news">More from TVSE</h2><CardGrid cards={cards.slice(2)} /></section><EditorialCTA /></Frame>;
}

function GuidesPage({ page }: { page: TvsePage }) {
  return <Frame className="editorial-page guides-layout"><section className="guide-shell shell"><header><h1>How To Guides</h1><p>{page.intro}</p></header><h2>Latest guides</h2><div className="guide-grid">{(page.cards ?? []).slice(0,3).map((card, index) => <article key={card.title}><div className="guide-image"><Image src={card.image} alt="" fill unoptimized sizes="33vw" /><span>GUIDE {String(index+1).padStart(2,"0")}</span></div><div><h3>{card.title}</h3><time>August {6-index}, 2026</time><p>{card.text}</p><Link href="/contact">Read the guide →</Link></div></article>)}</div><div className="guide-index">{(page.cards ?? []).slice(3).map((card, index) => <Link href="/contact" key={card.title}><span>{String(index+4).padStart(2,"0")}</span><strong>{card.title}</strong><b>→</b></Link>)}</div></section><EditorialCTA /></Frame>;
}

function CardGrid({ cards }: { cards: ResourceCard[] }) {
  const reduceMotion = useReducedMotion();
  return <div className="editorial-card-grid">{cards.map((card,index) => <motion.article key={`${card.title}-${index}`} initial={reduceMotion ? false : { y: 24, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} viewport={{ once:true, amount:.2 }}><div className="editorial-card-image"><Image src={card.image} alt="" fill unoptimized sizes="33vw" /></div><div><span>{card.label}</span><h3>{card.title}</h3><p>{card.text}</p><Link href="/contact">Read on →</Link></div></motion.article>)}</div>;
}

function EditorialCTA() { return <section className="editorial-cta"><FlyingPlanes accent /><div className="shell"><span>TVSE travel intelligence</span><h2>Good decisions travel further.</h2><ArrowButton href="/contact">Talk to our team</ArrowButton></div></section>; }

function ContactPage({ page }: { page: TvsePage }) {
  const [message, setMessage] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setMessage("Sending…"); const form = new FormData(event.currentTarget); const interest = String(form.get("interest")); const type = interest === "Business travel" ? "corporate" : interest === "Partnership" ? "partner" : interest === "Booking support" ? "support" : "personal"; try { const response = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), email: form.get("email"), type, message: form.get("message") }) }); const payload = await response.json() as { message?: string; error?: string }; if (!response.ok) throw new Error(payload.error || "Could not send your enquiry"); setMessage(payload.message || "Thank you. A TVSE travel specialist will follow up with you."); event.currentTarget.reset(); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not send your enquiry"); } };
  return <Frame className="contact-reference-page"><section className="contact-reference-head shell"><h1>How can we help you?</h1></section><section className="contact-choice-band"><FlyingPlanes accent /><div className="contact-choice-grid shell">{page.features.map((feature,index) => <a href="#contact-form" key={feature.title}><small>0{index+1}</small><h2>{feature.title}</h2><p>{feature.text}</p><span className="pill primary">{index === 0 ? "Plan my trip" : index === 1 ? "Get support" : index === 2 ? "Get started" : "Partner with us"}<b>→</b></span></a>)}</div></section><section className="contact-reference-form" id="contact-form"><div className="shell"><div><p className="campaign-kicker">START THE CONVERSATION</p><h2>Tell us where you want to go.</h2><p>Share the idea, the dates or the challenge. Our Nairobi team will connect you with the right specialist.</p></div><form onSubmit={submit}><label>Your name<input name="name" required /></label><label>Email address<input type="email" name="email" required /></label><label>What do you need?<select name="interest" defaultValue="Personal trip"><option>Personal trip</option><option>Business travel</option><option>Meetings & events</option><option>Booking support</option><option>Partnership</option></select></label><label>Tell us more<textarea name="message" rows={4} required /></label><button className="pill primary" type="submit">Send enquiry <span>→</span></button>{message && <p className="form-message" role="status">{message}</p>}</form></div></section></Frame>;
}

function PortalPage({ page }: { page: TvsePage }) {
  const [message, setMessage] = useState("");
  const key = pageKey(page.path);
  const portal = page.path.endsWith("business") ? "business" : page.path.endsWith("partner") ? "partner" : "traveler";
  const returnTo = portal === "traveler" ? "/portal" : `/${portal}`;
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setMessage("Sending your secure link…"); const form = new FormData(event.currentTarget); try { const response = await fetch("/api/auth/magic-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email"), portal, returnTo }) }); const payload = await response.json() as { message?: string; error?: string; debugLink?: string }; if (!response.ok) throw new Error(payload.error || "Could not send a sign-in link"); setMessage(payload.debugLink ? `${payload.message} Local preview: ${payload.debugLink}` : payload.message || "Check your email for a secure sign-in link."); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not send a sign-in link"); } };
  return <Frame className={`portal-reference-page portal-layout-${key}`}><section className="portal-reference-hero"><FlyingPlanes /><div className="shell"><div className="portal-reference-copy"><p className="campaign-kicker">{page.eyebrow}</p><h1>{page.heroTitle}</h1><p>{page.intro}</p><div className="portal-route"><span>NBO</span><i /><b>✈</b><i /><span>WORLDWIDE</span></div></div><form onSubmit={submit}><small>SECURE TVSE ACCESS</small><h2>Welcome back</h2><p>We&apos;ll email you a single-use link. No password to remember.</p><label>Email address<input type="email" name="email" required /></label><button className="pill primary" type="submit">Email secure link <span>→</span></button><a href="mailto:hello@tvsetravel.com">Need account help?</a>{message && <p className="form-message" role="status">{message}</p>}</form></div></section><section className="portal-benefits shell section"><div><p className="campaign-kicker">{page.sectionEyebrow}</p><h2>{page.sectionTitle}</h2><p>{page.sectionText}</p></div><div>{page.features.map((feature,index)=><article key={feature.title}><span>0{index+1}</span><h3>{feature.title}</h3><p>{feature.text}</p></article>)}</div></section></Frame>;
}
