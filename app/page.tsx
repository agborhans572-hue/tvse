"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";

const services = [
  {
    title: "Flights & stays",
    text: "Handpicked routes and stays, coordinated from takeoff to check-in.",
    image: "/cape-town.jpg",
  },
  {
    title: "Tailor-made holidays",
    text: "One-of-a-kind trips shaped around your pace, people and priorities.",
    image: "/santorini.jpg",
  },
  {
    title: "Safaris & escapes",
    text: "Wild places, trusted hosts and the moments you will talk about for years.",
    image: "/maasai-mara.jpg",
  },
  {
    title: "Corporate travel",
    text: "Responsive travel support that keeps your people and plans moving.",
    image: "/bali.jpg",
  },
];

const stories = [
  {
    kicker: "ISLAND ESCAPE",
    title: "A slower week on the shores of Zanzibar",
    image: "/hero-zanzibar.jpg",
  },
  {
    kicker: "WILD AFRICA",
    title: "Golden-hour game drives in the Maasai Mara",
    image: "/maasai-mara.jpg",
  },
  {
    kicker: "CITY & COAST",
    title: "Cape Town, from mountain mornings to coastal nights",
    image: "/cape-town.jpg",
  },
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <main id="top">
      <header className="site-header shell">
        <a className="logo logo-with-3d" href="#top" aria-label="TVSE Travel home">
          <motion.span
            className="header-logo-mark"
            whileHover={reduceMotion ? undefined : { scale: 1.08, rotateX: -7, rotateY: 10, y: -2 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
          >
            <Image src="/tvse-3d-logo.png" alt="" fill unoptimized priority sizes="82px" />
          </motion.span>
          <span className="header-logo-type">
            <strong>TVSE</strong>
            <small>TRAVEL</small>
          </span>
        </a>

        <nav className={menuOpen ? "main-nav is-open" : "main-nav"} aria-label="Main navigation">
          <a href="#services" onClick={() => setMenuOpen(false)}>Travel solutions <span>⌄</span></a>
          <a href="#destinations" onClick={() => setMenuOpen(false)}>Destinations <span>⌄</span></a>
          <a href="#why-tvse" onClick={() => setMenuOpen(false)}>Why TVSE</a>
          <a href="#stories" onClick={() => setMenuOpen(false)}>Inspiration</a>
        </nav>

        <div className="header-actions">
          <a className="search-link" href="#stories" aria-label="Search">⌕</a>
          <a className="pill primary compact" href="#contact">Plan my trip</a>
          <button
            className="menu-toggle"
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span /><span />
          </button>
        </div>
      </header>

      <section className="hero shell-wide" aria-labelledby="hero-title">
        <div className="hero-copy shell-inset">
          <p className="overline">Travel, open to possibility</p>
          <h1 id="hero-title">Remarkable journeys.<br />Made personal.</h1>
          <p className="hero-lead">
            From first idea to final touchdown, we design seamless trips that feel unmistakably yours.
          </p>
          <div className="button-row">
            <a className="pill primary" href="#destinations">Explore escapes <span>→</span></a>
            <a className="pill outline" href="#contact">Get started <span>→</span></a>
          </div>
        </div>

        <div className="hero-visual">
          <Image
            src="/hero-zanzibar.jpg"
            alt="Turquoise island resort surrounded by ocean"
            fill
            unoptimized
            priority
            sizes="(max-width: 800px) 100vw, 55vw"
          />
          <div className="hero-rings" aria-hidden="true"><i /><i /><i /></div>
          <div className="trip-card">
            <span className="trip-card-icon">T</span>
            <div><small>TVSE TRAVEL</small><strong>Your island itinerary is ready.</strong></div>
            <b>Now</b>
          </div>
          <div className="place-card">
            <span>FEATURED ESCAPE</span>
            <strong>Zanzibar</strong>
            <small>6 nights · beach & culture</small>
          </div>
        </div>
        <motion.div
          className="motion-plane hero-plane"
          aria-hidden="true"
          initial={false}
          animate={
            reduceMotion
              ? { x: "76vw", y: -120, rotate: 5, opacity: 0.72 }
              : {
                  x: ["-14vw", "28vw", "72vw", "108vw"],
                  y: [120, 35, -50, -190],
                  rotate: [-16, -8, 2, 13],
                  scale: [0.72, 1, 1.12, 0.88],
                  opacity: [0, 1, 1, 0],
                }
          }
          transition={{
            duration: 7.2,
            times: [0, 0.44, 0.86, 1],
            ease: [0.45, 0, 0.2, 1],
            repeat: reduceMotion ? 0 : Infinity,
            repeatDelay: 2.1,
          }}
        >
          <span className="flight-trail" />
          <span className="plane-glyph">✈</span>
        </motion.div>
      </section>

      <section className="trust-band" aria-label="TVSE at a glance">
        <div className="shell trust-inner">
          <h2>Travel designed around you, supported all the way</h2>
          <div className="trust-items">
            <div><strong>40+</strong><span>destinations curated</span></div>
            <div><strong>24/7</strong><span>traveller support</span></div>
            <div><strong>1</strong><span>dedicated travel partner</span></div>
            <div><strong>100%</strong><span>personal attention</span></div>
          </div>
        </div>
      </section>

      <section className="services shell section" id="services">
        <div className="center-heading">
          <p className="overline">Everything your journey needs</p>
          <h2>Travel expertise that delivers.<br />Real people who make it easy.</h2>
          <p>Thoughtful planning, trusted partners and calm support across every kind of trip.</p>
        </div>

        <div className="service-grid">
          {services.map((service) => (
            <article className="service-card" key={service.title}>
              <Image src={service.image} alt="" fill unoptimized loading="eager" sizes="(max-width: 760px) 100vw, 50vw" />
              <div className="service-shade" />
              <div className="service-copy">
                <h3>{service.title}</h3>
                <p>{service.text}</p>
                <a href="#contact" aria-label={`Learn more about ${service.title}`}>Learn more <span>→</span></a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="solutions shell section" id="destinations">
        <div className="solution-intro raised-card">
          <p className="overline">Built for every traveller</p>
          <h2>Travel solutions for <em>every kind of journey</em></h2>
          <p>Whether it is a long-awaited holiday, a spontaneous weekend or a business trip, your experience is designed with the freedom to grow and change with you.</p>
        </div>
        <div className="solution-grid">
          <article className="raised-card mini-solution">
            <span className="solution-number">01</span>
            <h3>Tailor-made escapes</h3>
            <p>We build a complete trip around your interests, timing and budget.</p>
            <a href="#contact">Start planning <span>→</span></a>
          </article>
          <article className="raised-card mini-solution">
            <span className="solution-number">02</span>
            <h3>Ready-to-book favourites</h3>
            <p>Curated itineraries for travellers who want inspiration without the guesswork.</p>
            <a href="#stories">Find your escape <span>→</span></a>
          </article>
        </div>
      </section>

      <section className="why-section" id="why-tvse">
        <div className="shell section">
          <div className="center-heading light-heading">
            <p className="overline">Why travellers choose TVSE</p>
            <h2>Expert care. Flexible plans.<br />Confidence at every turn.</h2>
          </div>
          <div className="reason-grid">
            <article><span>✦</span><h3>One size never fits all</h3><p>Every trip is shaped around how you want to travel, not around a template.</p></article>
            <article><span>♥</span><h3>Human support you can trust</h3><p>A real travel partner is with you before, during and after your journey.</p></article>
            <article><span>⌁</span><h3>Trusted partners worldwide</h3><p>Carefully chosen hotels, guides and operators help every detail run smoothly.</p></article>
            <article><span>◎</span><h3>Everything in one place</h3><p>Flights, stays, experiences and support come together in one clear plan.</p></article>
          </div>
        </div>
      </section>

      <section className="platform-cta shell-wide">
        <div className="platform-copy shell-inset">
          <p className="overline">Travel managed your way</p>
          <h2>Your plans, beautifully connected.</h2>
          <p>Discover, book and manage the details with one expert team. More choice, less friction and support whenever plans change.</p>
          <a className="pill white" href="#contact">Plan with TVSE <span>→</span></a>
        </div>
        <div className="platform-art" aria-hidden="true">
          <i /><i /><i /><i />
          <motion.div
            className="platform-plane"
            initial={{ x: -90, y: 150, rotate: -18, opacity: 0 }}
            whileInView={
              reduceMotion
                ? { x: 235, y: -25, rotate: 8, opacity: 0.7 }
                : {
                    x: [-90, 70, 350],
                    y: [150, 25, -115],
                    rotate: [-18, -2, 18],
                    scale: [0.78, 1.15, 0.9],
                    opacity: [0, 1, 0],
                  }
            }
            viewport={{ amount: 0.25 }}
            transition={{ duration: 5.6, ease: "easeInOut", repeat: reduceMotion ? 0 : Infinity, repeatDelay: 1.2 }}
          >
            <span className="flight-trail light-trail" />
            <span className="plane-glyph">✈</span>
          </motion.div>
          <div className="route-line">
            <b>NAIROBI</b>
            <span className="route-track" />
            <motion.span
              className="route-plane"
              animate={reduceMotion ? { x: "300%", rotate: 7 } : { x: ["0%", "650%", "0%"], rotate: [7, -5, 7] }}
              transition={{ duration: 4.4, ease: "easeInOut", repeat: reduceMotion ? 0 : Infinity }}
            >✈</motion.span>
            <b>ANYWHERE</b>
          </div>
        </div>
      </section>

      <section className="stories shell section" id="stories">
        <div className="center-heading">
          <p className="overline">Travel inspiration</p>
          <h2>Journeys worth remembering</h2>
          <p>Three ideas to start your next story.</p>
        </div>
        <div className="story-grid">
          {stories.map((story) => (
            <article className="story-card" key={story.title}>
              <div className="story-image"><Image src={story.image} alt="" fill unoptimized loading="eager" sizes="(max-width: 760px) 100vw, 33vw" /></div>
              <div className="story-copy">
                <span>{story.kicker}</span>
                <h3>{story.title}</h3>
                <a href="#contact">Read on <b>→</b></a>
              </div>
            </article>
          ))}
        </div>
        <a className="pill primary story-button" href="#destinations">View all destinations <span>→</span></a>
      </section>

      <section className="specialist shell" aria-labelledby="specialist-title">
        <div className="specialist-copy">
          <p className="overline">Made for the moment</p>
          <h2 id="specialist-title">Specialized trips built to outperform the ordinary</h2>
        </div>
        <div className="specialist-list">
          <a href="#contact"><span>01</span>Honeymoons & romance <b>→</b></a>
          <a href="#contact"><span>02</span>Safaris & adventure <b>→</b></a>
          <a href="#contact"><span>03</span>Family holidays <b>→</b></a>
          <a href="#contact"><span>04</span>Business travel <b>→</b></a>
        </div>
        <div className="specialist-path" aria-hidden="true"><i /><i /><i /></div>
        <motion.div
          className="motion-plane specialist-plane"
          aria-hidden="true"
          initial={{ x: -210, y: 150, rotate: -25, opacity: 0 }}
          whileInView={
            reduceMotion
              ? { x: 250, y: -145, rotate: 18, opacity: 0.72 }
              : {
                  x: [-210, -10, 185, 390],
                  y: [150, 42, -72, -210],
                  rotate: [-25, -9, 6, 24],
                  scale: [0.78, 1, 1.15, 0.82],
                  opacity: [0, 1, 1, 0],
                }
          }
          viewport={{ amount: 0.28 }}
          transition={{ duration: 5.9, times: [0, 0.42, 0.84, 1], ease: "easeInOut", repeat: reduceMotion ? 0 : Infinity, repeatDelay: 1.5 }}
        >
          <span className="flight-trail green-trail" />
          <span className="plane-glyph">✈</span>
        </motion.div>
      </section>

      <section className="numbers shell section">
        <article className="number-lead"><p className="overline">The TVSE difference</p><h2>We create connections that move people and ideas forward.</h2></article>
        <article className="number-card orange"><strong>Local</strong><span>knowledge, global reach</span></article>
        <article className="number-card blue"><strong>40+</strong><span>destinations worldwide</span></article>
        <article className="number-card violet"><strong>24/7</strong><span>support when you travel</span></article>
        <article className="number-card green"><strong>Always</strong><span>people first</span></article>
        <article className="number-story"><p>Our story is one of curiosity, care and getting every detail right — so you can simply enjoy the journey.</p><a className="pill primary compact" href="#contact">Get to know us <span>→</span></a></article>
      </section>

      <footer className="footer" id="contact">
        <div className="footer-cta shell">
          <h2>Let&apos;s go somewhere.</h2>
          <p>Share the idea. We&apos;ll turn it into a journey.</p>
          <a className="pill white" href="mailto:hello@tvsetravel.com">Start the conversation <span>→</span></a>
        </div>
        <div className="footer-columns shell">
          <div className="footer-about">
            <a className="logo footer-logo" href="#top">
              <span className="logo-word">TVSE</span><small>TRAVEL</small>
            </a>
            <p>People-first travel design for holidays, business trips and unforgettable escapes — from Nairobi to the world.</p>
            <div className="socials"><a href="#contact">in</a><a href="#contact">ig</a><a href="#contact">f</a></div>
          </div>
          <div><h3>Travel</h3><a href="#services">Flights & stays</a><a href="#services">Tailor-made holidays</a><a href="#services">Safaris</a><a href="#services">Corporate travel</a></div>
          <div><h3>Explore</h3><a href="#destinations">Destinations</a><a href="#stories">Travel inspiration</a><a href="#why-tvse">Why TVSE</a><a href="#contact">Plan a trip</a></div>
          <div><h3>Contact</h3><a href="mailto:hello@tvsetravel.com">hello@tvsetravel.com</a><span>Nairobi, Kenya</span><span>Mon–Fri · 8am–6pm</span></div>
        </div>
        <div className="footer-bottom shell"><span>© 2026 TVSE Travel Agency Ltd.</span><div><a href="#top">Privacy</a><a href="#top">Terms</a><a href="#top">Back to top ↑</a></div></div>
        <div className="footer-rings" aria-hidden="true"><i /><i /><i /><i /></div>
      </footer>
    </main>
  );
}
