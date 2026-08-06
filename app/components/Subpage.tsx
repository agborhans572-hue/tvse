"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import type { FormEvent } from "react";
import type { TvsePage } from "../page-data";
import { SiteFooter, SiteHeader } from "./SiteChrome";

export function Subpage({ page }: { page: TvsePage }) {
  const reduceMotion = useReducedMotion();
  const [formMessage, setFormMessage] = useState("");

  const submitDemo = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormMessage(page.variant === "contact"
      ? "Thank you. A TVSE travel specialist will follow up with you."
      : "This portal is ready to connect to TVSE's secure account system.");
  };

  return (
    <main id="top" className="subpage-root">
      <SiteHeader />

      <section className={`subpage-hero tone-${page.tone}`}>
        <div className="subpage-hero-copy shell">
          <p className="overline">{page.eyebrow}</p>
          <h1>{page.heroTitle}</h1>
          <p className="subpage-lead">{page.intro}</p>
          <a className="pill primary" href="#page-content">{page.ctaLabel} <span>→</span></a>
        </div>
        <motion.div
          className="detail-flight"
          aria-hidden="true"
          animate={reduceMotion ? { x: "72vw", y: -55, opacity: 0.7 } : {
            x: ["-10vw", "36vw", "105vw"],
            y: [75, -20, -125],
            rotate: [-12, 0, 14],
            opacity: [0, 1, 0],
          }}
          transition={{ duration: 6.8, ease: "easeInOut", repeat: reduceMotion ? 0 : Infinity, repeatDelay: 1.5 }}
        >
          <span className="detail-flight-trail" />
          <span>✈</span>
        </motion.div>
      </section>

      <section className="subpage-media shell-wide" aria-label={`${page.eyebrow} visual`}>
        <Image src={page.heroImage} alt="" fill unoptimized priority sizes="100vw" />
        <div className="subpage-media-shade" />
        <motion.div
          className="subpage-metric"
          initial={reduceMotion ? false : { y: 38, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.65 }}
        >
          <strong>{page.metric}</strong>
          <span>{page.metricLabel}</span>
        </motion.div>
        <div className="subpage-route" aria-hidden="true">
          <span>NAIROBI</span><i /><b>✈</b><span>WORLDWIDE</span>
        </div>
      </section>

      <div id="page-content">
        {page.variant === "resources" && <ResourceContent page={page} reduceMotion={Boolean(reduceMotion)} />}
        {page.variant === "portal" && <PortalContent page={page} onSubmit={submitDemo} message={formMessage} />}
        {page.variant === "contact" && <ContactContent page={page} onSubmit={submitDemo} message={formMessage} />}
        {page.variant === "detail" && <DetailContent page={page} reduceMotion={Boolean(reduceMotion)} />}
      </div>

      <section className={`subpage-closing tone-${page.tone}`}>
        <div className="shell subpage-closing-inner">
          <div><p className="overline">People first, always</p><h2>Ready to move your plans forward?</h2></div>
          <a className="pill white" href="/contact">Get started <span>→</span></a>
          <motion.span
            className="closing-plane"
            aria-hidden="true"
            animate={reduceMotion ? { x: 120 } : { x: [-40, 170, -40], y: [10, -20, 10], rotate: [-8, 8, -8] }}
            transition={{ duration: 5, repeat: reduceMotion ? 0 : Infinity, ease: "easeInOut" }}
          >✈</motion.span>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function DetailContent({ page, reduceMotion }: { page: TvsePage; reduceMotion: boolean }) {
  return (
    <>
      <section className="subpage-intro shell section">
        <div>
          <p className="overline">{page.sectionEyebrow}</p>
          <h2>{page.sectionTitle}</h2>
        </div>
        <p>{page.sectionText}</p>
      </section>
      <section className="subpage-feature-wrap">
        <div className="shell section">
          <div className="subpage-section-heading">
            <p className="overline">Why travelers choose TVSE</p>
            <h2>Service that performs. People who solve.</h2>
          </div>
          <div className="subpage-feature-grid">
            {page.features.map((feature, index) => (
              <motion.article
                key={feature.title}
                initial={reduceMotion ? false : { y: 28, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.5, delay: index * 0.07 }}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>
      <section className="subpage-choice shell section">
        <div className="subpage-choice-art" aria-hidden="true"><i /><i /><i /><span>✈</span></div>
        <div>
          <p className="overline">Built around your needs</p>
          <h2>One size never fits all.</h2>
          <p>Choose the support, partners and technology that make sense for your travelers. TVSE keeps the experience connected while leaving room for your program to evolve.</p>
          <a className="pill outline" href="/contact">Build it with TVSE <span>→</span></a>
        </div>
      </section>
    </>
  );
}

function ResourceContent({ page, reduceMotion }: { page: TvsePage; reduceMotion: boolean }) {
  return (
    <section className="resource-section shell section">
      <div className="subpage-section-heading resource-heading">
        <p className="overline">{page.sectionEyebrow}</p>
        <h2>{page.sectionTitle}</h2>
        <p>{page.sectionText}</p>
      </div>
      <div className="resource-filters" aria-label="Resource categories">
        <span className="active">All</span><span>Destinations</span><span>Business travel</span><span>Travel well</span>
      </div>
      <div className="resource-grid">
        {page.cards?.map((card, index) => (
          <motion.article
            className="resource-card"
            key={card.title}
            initial={reduceMotion ? false : { y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, delay: (index % 3) * 0.08 }}
          >
            <div className="resource-image"><Image src={card.image} alt="" fill unoptimized sizes="(max-width: 760px) 100vw, 33vw" /></div>
            <div className="resource-copy"><span>{card.label}</span><h3>{card.title}</h3><p>{card.text}</p><a href="/contact">Read on <b>→</b></a></div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}

function PortalContent({ page, onSubmit, message }: { page: TvsePage; onSubmit: (event: FormEvent<HTMLFormElement>) => void; message: string }) {
  return (
    <section className="portal-section shell section">
      <div className="portal-copy">
        <p className="overline">{page.sectionEyebrow}</p>
        <h2>{page.sectionTitle}</h2>
        <p>{page.sectionText}</p>
        <div className="portal-points">
          {page.features.map((feature) => <div key={feature.title}><strong>{feature.title}</strong><span>{feature.text}</span></div>)}
        </div>
      </div>
      <form className="portal-card" onSubmit={onSubmit}>
        <span className="portal-kicker">SECURE TVSE ACCESS</span>
        <h2>Welcome back</h2>
        <p>Enter your account details to continue.</p>
        <label>Email address<input type="email" name="email" autoComplete="email" required placeholder="you@company.com" /></label>
        <label>Password<input type="password" name="password" autoComplete="current-password" required placeholder="Your password" /></label>
        <button className="pill primary" type="submit">Sign in <span>→</span></button>
        <a href="mailto:hello@tvsetravel.com">Need account help?</a>
        {message && <div className="form-message" role="status">{message}</div>}
      </form>
    </section>
  );
}

function ContactContent({ page, onSubmit, message }: { page: TvsePage; onSubmit: (event: FormEvent<HTMLFormElement>) => void; message: string }) {
  return (
    <>
      <section className="contact-options shell section">
        <div className="subpage-section-heading">
          <p className="overline">{page.sectionEyebrow}</p>
          <h2>{page.sectionTitle}</h2>
          <p>{page.sectionText}</p>
        </div>
        <div className="contact-option-grid">
          {page.features.map((feature, index) => (
            <a href="#contact-form" key={feature.title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{feature.title}</h3><p>{feature.text}</p><b>→</b></a>
          ))}
        </div>
      </section>
      <section className="contact-form-band" id="contact-form">
        <div className="shell contact-form-grid">
          <div><p className="overline">Tell us about the journey</p><h2>Start with the idea. We&apos;ll shape the details.</h2><p>Share a little about what you need and a TVSE specialist will get back to you.</p></div>
          <form onSubmit={onSubmit}>
            <label>Your name<input name="name" required placeholder="Full name" /></label>
            <label>Email address<input type="email" name="email" required placeholder="you@example.com" /></label>
            <label>What can we help with?<select name="interest" defaultValue="Personal trip"><option>Personal trip</option><option>Business travel</option><option>Meetings & events</option><option>Active booking support</option><option>Partnership</option></select></label>
            <label>Tell us more<textarea name="message" rows={4} required placeholder="Destination, dates, travelers or the support you need" /></label>
            <button className="pill primary" type="submit">Send enquiry <span>→</span></button>
            {message && <div className="form-message" role="status">{message}</div>}
          </form>
        </div>
      </section>
    </>
  );
}
