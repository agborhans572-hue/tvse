"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { SiteFooter, SiteHeader } from "./components/SiteChrome";

const services = [
  {
    title: "Accommodation",
    text: "Hotels, resorts and private stays selected around your comfort, location and budget.",
    image: "/services/accommodation.png",
    href: "/plan-a-trip?service=accommodation",
  },
  {
    title: "Delivery services",
    text: "Dependable local delivery coordination for travel documents, parcels and essential items.",
    image: "/services/delivery.png",
    href: "/plan-a-trip?service=delivery",
  },
  {
    title: "Ticketing",
    text: "Flight research, reservations and ticket support for smooth regional and international travel.",
    image: "/services/ticketing-google.jpg",
    href: "/plan-a-trip?service=ticketing",
  },
  {
    title: "Car rental services",
    text: "Flexible self-drive and chauffeured vehicles matched to your route, schedule and group size.",
    image: "/services/car-rental.png",
    href: "/plan-a-trip?service=car-rental",
  },
  {
    title: "Safaris",
    text: "Unforgettable wildlife journeys with trusted guides, thoughtful stays and seamless logistics.",
    image: "/services/safari-tvse.jpg",
    href: "/plan-a-trip?service=safaris",
  },
  {
    title: "Airport transfers",
    text: "Reliable pickups and drop-offs that keep arrivals, departures and connections stress-free.",
    image: "/services/airport-transfer-google.jpg",
    href: "/plan-a-trip?service=airport-transfer",
  },
];

const serviceMoments = [
  {
    id: "services",
    theme: "essential",
    start: 1,
    overline: "Begin with the essentials",
    title: "Stay beautifully. Fly confidently.",
    text: "Thoughtful accommodation and expert ticketing give every journey a smooth beginning.",
    items: [services[0], services[2]],
  },
  {
    id: "ground-support",
    theme: "tint",
    start: 3,
    overline: "On-the-ground support",
    title: "Every connection, handled door to door.",
    text: "Practical support keeps people, luggage and important items moving exactly where they need to go.",
    items: [services[1], services[5]],
  },
  {
    id: "explore-your-way",
    theme: "offset",
    start: 5,
    overline: "More ways to discover",
    title: "Take the road. Follow the wild.",
    text: "Choose the freedom of your own vehicle or let TVSE shape an unforgettable safari into the journey.",
    items: [services[3], services[4]],
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

const featuredAirlines = [
  { name: "Kenya Airways", logo: "/airlines/kenya-airways.svg" },
  { name: "Emirates", logo: "/airlines/emirates.svg" },
  { name: "Qatar Airways", logo: "/airlines/qatar-airways.svg" },
  { name: "Ethiopian Airlines", logo: "/airlines/ethiopian-airlines.svg" },
  { name: "Turkish Airlines", logo: "/airlines/turkish-airlines.svg" },
  { name: "KLM", logo: "/airlines/klm.svg" },
  { name: "British Airways", logo: "/airlines/british-airways.svg" },
  { name: "RwandAir", logo: "/airlines/rwandair.svg" },
  { name: "Lufthansa", logo: "/airlines/lufthansa.svg" },
  { name: "Air France", logo: "/airlines/air-france.svg" },
];

function ServiceMoment({ moment }: { moment: (typeof serviceMoments)[number] }) {
  return (
    <section
      className={`service-moment service-moment--${moment.theme}${moment.theme === "tint" ? " shell-wide" : ""}`}
      id={moment.id}
      aria-labelledby={`${moment.id}-title`}
    >
      <div className="shell service-moment-heading">
        <div>
          <p className="overline">{moment.overline}</p>
          <h2 id={`${moment.id}-title`}>{moment.title}</h2>
        </div>
        <p>{moment.text}</p>
      </div>
      <div className="shell service-feature-grid">
        {moment.items.map((service, index) => (
          <article className="service-feature-card" key={service.title}>
            <div className="service-feature-image">
              <Image src={service.image} alt="" fill unoptimized sizes="(max-width: 820px) 100vw, 50vw" />
            </div>
            <div className="service-feature-copy">
              <span className="service-index">0{moment.start + index}</span>
              <h3>{service.title}</h3>
              <p>{service.text}</p>
              <Link href={service.href} aria-label={`Learn more about ${service.title}`}>
                Enquire now <b aria-hidden="true">&#8594;</b>
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const reduceMotion = useReducedMotion();

  return (
    <main id="top">
      <SiteHeader />

      <section className="hero shell-wide" aria-labelledby="hero-title">
        <div className="hero-copy shell-inset">
          <p className="overline">Travel, open to possibility</p>
          <h1 id="hero-title">Remarkable journeys.<br />Made personal.</h1>
          <p className="hero-lead">
            From first idea to final touchdown, we design seamless trips that feel unmistakably yours.
          </p>
          <div className="button-row">
            <Link className="pill primary" href="/destinations">Explore escapes <span>→</span></Link>
            <Link className="pill outline" href="/plan-a-trip">Get started <span>→</span></Link>
          </div>
        </div>

        <div className="hero-visual hero-device-stage">
          <motion.div
            className="hero-showcase-wrap"
            initial={false}
            animate={reduceMotion ? undefined : { y: [0, -7, 0], rotate: [0, -0.35, 0] }}
            transition={{ duration: 5.5, ease: "easeInOut", repeat: Infinity }}
          >
            <Image
              className="hero-showcase"
              src="/hero-travel-concierge-natural.png"
              alt="Traveller checking a TVSE flight booking beside a mobile travel itinerary"
              width={1330}
              height={1183}
              unoptimized
              priority
              sizes="(max-width: 560px) 108vw, (max-width: 820px) 620px, 760px"
            />
          </motion.div>
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

      <section className="trust-band" aria-labelledby="airline-marquee-title">
        <div className="shell trust-inner">
          <div className="airline-marquee-heading">
            <div>
              <p className="airline-marquee-kicker">Featured airlines</p>
              <h2 id="airline-marquee-title">Travel designed around you, supported all the way</h2>
            </div>
            <p>Explore route possibilities across leading regional and international carriers.</p>
          </div>
        </div>
        <div className="airline-marquee" aria-label="Featured airlines">
          <div className="airline-marquee-track">
            {[0, 1].map((copy) => (
              <div
                className="airline-marquee-group"
                key={copy}
                aria-hidden={copy === 1 ? true : undefined}
              >
                {featuredAirlines.map((airline) => (
                  <span className="airline-logo-card" key={`${copy}-${airline.name}`}>
                    <Image
                      src={airline.logo}
                      alt={copy === 0 ? `${airline.name} logo` : ""}
                      fill
                      unoptimized
                      sizes="190px"
                    />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <ServiceMoment moment={serviceMoments[0]} />

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
            <Link href="/plan-a-trip">Start planning <span>→</span></Link>
          </article>
          <article className="raised-card mini-solution">
            <span className="solution-number">02</span>
            <h3>Ready-to-book favourites</h3>
            <p>Curated itineraries for travellers who want inspiration without the guesswork.</p>
            <Link href="/packages">Find your escape <span>→</span></Link>
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
          <Link className="pill white" href="/plan-a-trip">Plan with TVSE <span>→</span></Link>
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

      <ServiceMoment moment={serviceMoments[1]} />

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
                <Link href="/resources">Read on <b>→</b></Link>
              </div>
            </article>
          ))}
        </div>
        <Link className="pill primary story-button" href="/destinations">View all destinations <span>→</span></Link>
      </section>

      <ServiceMoment moment={serviceMoments[2]} />

      <section className="specialist shell" aria-labelledby="specialist-title">
        <div className="specialist-copy">
          <p className="overline">Made for the moment</p>
          <h2 id="specialist-title">Specialized trips built to outperform the ordinary</h2>
        </div>
        <div className="specialist-list">
          <Link href="/plan-a-trip"><span>01</span>Honeymoons & romance <b>→</b></Link>
          <Link href="/destinations/maasai-mara"><span>02</span>Safaris & adventure <b>→</b></Link>
          <Link href="/packages/kenya-family-adventure"><span>03</span>Family holidays <b>→</b></Link>
          <Link href="/corporate"><span>04</span>Business travel <b>→</b></Link>
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
        <article className="number-card blue"><strong>12</strong><span>curated destinations</span></article>
        <article className="number-card violet"><strong>With you</strong><span>through every active journey</span></article>
        <article className="number-card green"><strong>Always</strong><span>people first</span></article>
        <article className="number-story"><p>Our story is one of curiosity, care and getting every detail right — so you can simply enjoy the journey.</p><Link className="pill primary compact" href="/about">Get to know us <span>→</span></Link></article>
      </section>

      <SiteFooter />
    </main>
  );
}
