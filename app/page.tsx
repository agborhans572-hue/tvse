"use client";

import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";

type TripMode = "Flights" | "Stays" | "Packages";
type Mood = "All escapes" | "Safari" | "Beach" | "City" | "Romance";

const destinations = [
  {
    name: "Maasai Mara",
    country: "Kenya",
    mood: "Safari",
    days: "4 days",
    price: "KES 89,000",
    image: "/maasai-mara.jpg",
    note: "Game drives, boutique camp & return flights",
  },
  {
    name: "Santorini",
    country: "Greece",
    mood: "Romance",
    days: "6 days",
    price: "KES 248,000",
    image: "/santorini.jpg",
    note: "Clifftop stay, breakfast & island cruise",
  },
  {
    name: "Cape Town",
    country: "South Africa",
    mood: "City",
    days: "5 days",
    price: "KES 132,000",
    image: "/cape-town.jpg",
    note: "City stay, Winelands tour & transfers",
  },
  {
    name: "Bali",
    country: "Indonesia",
    mood: "Beach",
    days: "7 days",
    price: "KES 219,000",
    image: "/bali.jpg",
    note: "Ubud retreat, Seminyak stay & experiences",
  },
];

const moodOptions: Mood[] = ["All escapes", "Safari", "Beach", "City", "Romance"];

export default function Home() {
  const [tripMode, setTripMode] = useState<TripMode>("Packages");
  const [mood, setMood] = useState<Mood>("All escapes");
  const [menuOpen, setMenuOpen] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [searchMessage, setSearchMessage] = useState("");
  const [inquirySent, setInquirySent] = useState(false);

  const visibleDestinations = useMemo(
    () =>
      mood === "All escapes"
        ? destinations
        : destinations.filter((destination) => destination.mood === mood),
    [mood],
  );

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const from = String(data.get("from") || "Nairobi");
    const to = String(data.get("to") || "your dream destination");
    setSearchMessage(
      `${tripMode} from ${from} to ${to} are ready for a travel designer to refine.`,
    );
  }

  function toggleSaved(destination: string) {
    setSaved((current) =>
      current.includes(destination)
        ? current.filter((item) => item !== destination)
        : [...current, destination],
    );
  }

  function submitInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInquirySent(true);
  }

  return (
    <main>
      <section className="hero" id="home">
        <div className="hero-shade" aria-hidden="true" />
        <header className="topbar page-shell">
          <a className="brand" href="#home" aria-label="TVSE Travel home">
            <span className="brand-mark" aria-hidden="true">T</span>
            <span>TVSE <b>TRAVEL</b></span>
          </a>

          <nav className={menuOpen ? "nav-links nav-links-open" : "nav-links"} aria-label="Main navigation">
            <a href="#destinations" onClick={() => setMenuOpen(false)}>Destinations</a>
            <a href="#experiences" onClick={() => setMenuOpen(false)}>Experiences</a>
            <a href="#why-us" onClick={() => setMenuOpen(false)}>Why TVSE</a>
            <a className="nav-cta" href="#planner" onClick={() => setMenuOpen(false)}>Plan my trip</a>
          </nav>

          <button
            className="menu-button"
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span />
            <span />
          </button>
        </header>

        <div className="hero-content page-shell">
          <div className="hero-copy">
            <p className="eyebrow light">Made for the joy of going</p>
            <h1>Go somewhere<br /><em>unforgettable.</em></h1>
            <p className="hero-intro">
              Thoughtful journeys, handpicked stays and seamless support —
              designed in Nairobi, made for everywhere.
            </p>
          </div>
          <div className="hero-note" aria-label="Featured destination">
            <span className="note-line" />
            <div>
              <span>This season</span>
              <strong>Indian Ocean escapes</strong>
            </div>
          </div>
        </div>

        <div className="search-wrap page-shell" id="search">
          <form className="trip-search" onSubmit={submitSearch}>
            <div className="trip-tabs" role="tablist" aria-label="Trip search type">
              {(["Flights", "Stays", "Packages"] as TripMode[]).map((mode) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={tripMode === mode}
                  className={tripMode === mode ? "active" : ""}
                  key={mode}
                  onClick={() => setTripMode(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
            <div className="search-fields">
              <label>
                <span>From</span>
                <input name="from" defaultValue="Nairobi" aria-label="Travel origin" />
              </label>
              <label>
                <span>Where to?</span>
                <input name="to" placeholder="Pick a place" aria-label="Destination" />
              </label>
              <label>
                <span>When</span>
                <input name="dates" placeholder="Sep 12 — Sep 18" aria-label="Travel dates" />
              </label>
              <label>
                <span>Travellers</span>
                <select name="travellers" defaultValue="2" aria-label="Number of travellers">
                  <option value="1">1 traveller</option>
                  <option value="2">2 travellers</option>
                  <option value="3">3 travellers</option>
                  <option value="4">4+ travellers</option>
                </select>
              </label>
              <button className="search-button" type="submit" aria-label="Search trips">
                Explore <span aria-hidden="true">↗</span>
              </button>
            </div>
            {searchMessage && <p className="search-message" role="status">{searchMessage}</p>}
          </form>
        </div>
      </section>

      <section className="trust-strip" aria-label="TVSE service benefits">
        <div className="page-shell trust-grid">
          <div><span>01</span><p><strong>Human travel designers</strong>Real people, real recommendations.</p></div>
          <div><span>02</span><p><strong>Flexible ways to pay</strong>Secure your trip, then pay in stages.</p></div>
          <div><span>03</span><p><strong>Support that travels</strong>We are with you before, during and after.</p></div>
        </div>
      </section>

      <section className="destinations page-shell" id="destinations">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Curated for you</p>
            <h2>Where will your story go next?</h2>
          </div>
          <p>Distinctive stays, unforgettable experiences and routes we know well.</p>
        </div>

        <div className="mood-filter" aria-label="Filter trips by mood">
          {moodOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={mood === option ? "active" : ""}
              aria-pressed={mood === option}
              onClick={() => setMood(option)}
            >
              {option}
            </button>
          ))}
        </div>

        <div className="destination-grid">
          {visibleDestinations.map((destination, index) => (
            <article className={`destination-card destination-card-${index + 1}`} key={destination.name}>
              <div className="card-image">
                <Image src={destination.image} alt={`${destination.name}, ${destination.country}`} fill sizes="(max-width: 720px) 100vw, 50vw" />
                <span className="trip-length">{destination.days}</span>
                <button
                  className="save-button"
                  type="button"
                  aria-label={`${saved.includes(destination.name) ? "Remove" : "Save"} ${destination.name}`}
                  aria-pressed={saved.includes(destination.name)}
                  onClick={() => toggleSaved(destination.name)}
                >
                  {saved.includes(destination.name) ? "♥" : "♡"}
                </button>
              </div>
              <div className="card-copy">
                <div>
                  <p>{destination.country} · {destination.mood}</p>
                  <h3>{destination.name}</h3>
                  <span>{destination.note}</span>
                </div>
                <div className="card-price">
                  <small>from</small>
                  <strong>{destination.price}</strong>
                  <small>per person</small>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="experience" id="experiences">
        <div className="experience-photo">
          <Image src="/hero-zanzibar.jpg" alt="A private island resort in turquoise ocean water" fill sizes="(max-width: 860px) 100vw, 50vw" />
          <div className="photo-label"><span>Featured escape</span><strong>Barefoot luxury</strong></div>
        </div>
        <div className="experience-copy">
          <p className="eyebrow light">Travel, beautifully considered</p>
          <h2>Not a package.<br /><em>Your</em> kind of trip.</h2>
          <p>
            We start with how you want to feel, then shape every detail around
            you — the pace, the place, the perfect little moments in between.
          </p>
          <div className="experience-list">
            <div><span>01</span><p><strong>Tell us your travel mood</strong>Adventure, rest, romance or all three.</p></div>
            <div><span>02</span><p><strong>We design the details</strong>Flights, stays, visas and experiences in one plan.</p></div>
            <div><span>03</span><p><strong>You simply go</strong>One point of contact and support all the way.</p></div>
          </div>
          <a className="text-link" href="#planner">Start a conversation <span>↗</span></a>
        </div>
      </section>

      <section className="why-us page-shell" id="why-us">
        <div className="why-card why-intro">
          <p className="eyebrow">Why TVSE</p>
          <h2>Travel with fewer tabs open.</h2>
          <p>One trusted team brings every part of your journey together.</p>
        </div>
        <div className="why-card why-stat">
          <strong>40+</strong>
          <span>destinations we know and love</span>
        </div>
        <div className="why-card quote-card">
          <p>“Every detail felt effortless, but the trip still felt completely ours.”</p>
          <span>— Wanjiku & David, Cape Town</span>
        </div>
        <div className="why-card rating-card">
          <span className="stars" aria-label="Five out of five stars">★★★★★</span>
          <strong>Travellers return.<br />That means everything.</strong>
        </div>
      </section>

      <section className="planner" id="planner">
        <div className="page-shell planner-grid">
          <div className="planner-copy">
            <p className="eyebrow light">Your next chapter</p>
            <h2>Let’s make your<br />trip happen.</h2>
            <p>Share the dream. A TVSE travel designer will shape the first ideas around you.</p>
            <div className="availability"><span /> Nairobi team · Replies within one business day</div>
          </div>
          <form className="planner-form" onSubmit={submitInquiry}>
            <label><span>Your name</span><input name="name" required placeholder="How should we call you?" /></label>
            <label><span>Dream destination</span><input name="destination" required placeholder="Anywhere on your mind" /></label>
            <label><span>Best email</span><input name="email" required type="email" placeholder="you@example.com" /></label>
            <label>
              <span>Travel style</span>
              <select name="style" defaultValue="A little of everything">
                <option>A little of everything</option>
                <option>Beach and reset</option>
                <option>Wildlife and adventure</option>
                <option>Culture and food</option>
                <option>Romantic escape</option>
              </select>
            </label>
            <button type="submit">Send my trip idea <span>↗</span></button>
            {inquirySent && (
              <p className="form-success" role="status">Beautiful — your trip idea is ready for a TVSE travel designer.</p>
            )}
          </form>
        </div>
      </section>

      <footer>
        <div className="page-shell footer-grid">
          <a className="brand footer-brand" href="#home">
            <span className="brand-mark" aria-hidden="true">T</span>
            <span>TVSE <b>TRAVEL</b></span>
          </a>
          <p>Journeys worth remembering,<br />designed in Nairobi.</p>
          <div className="footer-links">
            <a href="#destinations">Destinations</a>
            <a href="#experiences">Experiences</a>
            <a href="#planner">Plan my trip</a>
          </div>
          <div className="footer-meta">
            <span>Nairobi, Kenya</span>
            <span>© 2026 TVSE Travel Agency Ltd.</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
