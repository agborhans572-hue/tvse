"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Destination, TravelPackage } from "../../lib/catalog";
import { formatMoney } from "../../lib/travel";
import { currentMarketingContext } from "../../lib/client-marketing";
import { usePublicContactLinks } from "./usePublicContactLinks";
import { readTurnstileToken, TurnstileField } from "./TurnstileField";

export function PublicHero({ eyebrow, title, intro, action, children }: { eyebrow: string; title: string; intro?: string; action?: { label: string; href: string }; children?: ReactNode }) {
  const reduce = useReducedMotion();
  return <section className="public-product-hero"><div className="shell"><p className="campaign-kicker">{eyebrow}</p><h1>{title}</h1>{intro && <p>{intro}</p>}{action && <Link className="pill primary" href={action.href}>{action.label}<span>→</span></Link>}{children}</div>{!reduce && <motion.span className="public-product-plane" aria-hidden="true" animate={{ x: ["-12vw", "112vw"], y: [80, -120], rotate: [-12, 10], opacity: [0, 1, 1, 0] }} transition={{ duration: 7.5, repeat: Infinity, repeatDelay: 1.8, ease: "easeInOut" }}>✈</motion.span>}</section>;
}

export function DestinationGrid({ destinations }: { destinations: Destination[] }) {
  const [query, setQuery] = useState(""); const [region, setRegion] = useState("All");
  const regions = ["All", ...Array.from(new Set(destinations.map((item) => item.region)))];
  const visible = useMemo(() => destinations.filter((item) => (region === "All" || item.region === region) && `${item.name} ${item.country} ${item.summary}`.toLowerCase().includes(query.toLowerCase())), [destinations, query, region]);
  return <><div className="catalog-tools"><label>Search destinations<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try Zanzibar or safari" /></label><label>Region<select value={region} onChange={(event) => setRegion(event.target.value)}>{regions.map((item) => <option key={item}>{item}</option>)}</select></label><span>{visible.length} places</span></div><div className="destination-grid">{visible.map((destination, index) => <motion.article key={destination.slug} initial={{ y: 24, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} viewport={{ once: true, amount: .2 }} transition={{ delay: (index % 3) * .06 }}><Link href={`/destinations/${destination.slug}`}><div className="destination-image"><Image src={destination.image} alt={`${destination.name}, ${destination.country}`} fill sizes="(max-width: 700px) 100vw, 33vw" />{destination.featured && <span>TVSE FAVOURITE</span>}</div><div><small>{destination.region}</small><h2>{destination.name}</h2><p>{destination.summary}</p><b>Explore {destination.name} →</b></div></Link></motion.article>)}</div>{visible.length === 0 && <div className="catalog-empty"><h2>No destination matches yet.</h2><p>Tell TVSE what you have in mind and we will plan beyond the catalog.</p><Link className="pill primary" href="/plan-a-trip">Plan something different</Link></div>}</>;
}

export function PackageGrid({ packages }: { packages: TravelPackage[] }) {
  const [currency, setCurrency] = useState("All"); const [duration, setDuration] = useState("All");
  const visible = packages.filter((item) => (currency === "All" || item.currency === currency) && (duration === "All" || (duration === "Short" ? item.durationDays <= 6 : item.durationDays > 6)));
  return <><div className="catalog-tools"><label>Currency<select value={currency} onChange={(event) => setCurrency(event.target.value)}><option>All</option><option>KES</option><option>USD</option></select></label><label>Length<select value={duration} onChange={(event) => setDuration(event.target.value)}><option>All</option><option>Short</option><option>Long</option></select></label><span>{visible.length} journeys</span></div><div className="package-grid">{visible.map((item) => <article key={item.slug}><div className="package-image"><Image src={item.image} alt="" fill sizes="(max-width: 800px) 100vw, 50vw" /><span>{item.durationDays} DAYS</span></div><div><small>FROM {formatMoney(item.fromPriceMinor, item.currency)} PER JOURNEY</small><h2>{item.title}</h2><p>{item.summary}</p><Link href={`/packages/${item.slug}`}>See the itinerary <b>→</b></Link></div></article>)}</div></>;
}

type PlannerState = { kind: "personal" | "corporate" | "event"; origin: string; destination: string; departureDate: string; returnDate: string; travelerCount: string; budget: string; currency: "KES" | "USD"; contactName: string; contactEmail: string; contactPhone: string; interests: string[]; notes: string };
const emptyPlanner: PlannerState = { kind: "personal", origin: "Nairobi", destination: "", departureDate: "", returnDate: "", travelerCount: "2", budget: "", currency: "KES", contactName: "", contactEmail: "", contactPhone: "", interests: [], notes: "" };

export function LegacyTripPlanner({ defaultDestination = "", destinationSlug, packageSlug }: { defaultDestination?: string; destinationSlug?: string; packageSlug?: string }) {
  const [step, setStep] = useState(1); const [form, setForm] = useState<PlannerState>({ ...emptyPlanner, destination: defaultDestination }); const [busy, setBusy] = useState(false); const [result, setResult] = useState<{ requestNumber: string } | null>(null); const [error, setError] = useState("");
  const contactLinks = usePublicContactLinks();
  const update = (key: keyof PlannerState, value: PlannerState[keyof PlannerState]) => setForm((current) => ({ ...current, [key]: value }));
  const toggleInterest = (value: string) => update("interests", form.interests.includes(value) ? form.interests.filter((item) => item !== value) : [...form.interests, value]);
  const next = () => { setError(""); if (step === 1 && (!form.destination || !form.departureDate || !form.returnDate)) return setError("Add a destination and travel dates to continue."); if (step === 2 && (!form.travelerCount || Number(form.travelerCount) < 1)) return setError("Tell us how many people are traveling."); setStep((value) => Math.min(4, value + 1)); };
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setError(""); const formElement = event.currentTarget; const submissionKey = formElement.dataset.submissionKey ||= crypto.randomUUID(); try { const response = await fetch("/api/trip-requests", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": submissionKey }, body: JSON.stringify({ kind: form.kind, contactName: form.contactName, contactEmail: form.contactEmail, contactPhone: form.contactPhone, origin: form.origin, destination: form.destination, departureDate: form.departureDate, returnDate: form.returnDate, travelerCount: Number(form.travelerCount), budgetMinor: Math.round(Number(form.budget || 0) * 100), currency: form.currency, interests: form.interests, notes: form.notes, consent: true, consentVersion: "2026-08", marketing: currentMarketingContext({ destinationSlug, packageSlug }), turnstileToken: readTurnstileToken(formElement) }) }); const payload = await response.json() as { data?: { requestNumber?: string }; error?: string }; if (!response.ok || !payload.data?.requestNumber) throw new Error(payload.error || "We could not send your request."); setResult({ requestNumber: payload.data.requestNumber }); } catch (cause) { setError(cause instanceof Error ? cause.message : "We could not send your request."); } finally { setBusy(false); } };
  if (result) return <div className="planner-success" role="status"><span>✓</span><p className="campaign-kicker">TRAVEL BRIEF RECEIVED</p><h2>{result.requestNumber}</h2><p>A TVSE specialist will review your brief. We also sent the next steps to {form.contactEmail}.</p><div><Link className="pill primary" href="/login/traveler">Open traveler portal</Link>{contactLinks.whatsapp&&<a className="pill outline" href={`https://wa.me/${contactLinks.whatsapp}?text=${encodeURIComponent(`Hello TVSE, my travel request is ${result.requestNumber}.`)}`}>Continue on WhatsApp</a>}</div></div>;
  return <form className="trip-planner" onSubmit={submit}><div className="planner-progress" aria-label={`Step ${step} of 4`}>{[1,2,3,4].map((number) => <button type="button" key={number} className={step >= number ? "active" : ""} onClick={() => number < step && setStep(number)} aria-label={`Go to step ${number}`}><span>{number}</span><i /></button>)}</div>
    {step === 1 && <fieldset><legend>Where should we take you?</legend><p>Start with the shape of the journey. Your specialist will refine the details.</p><div className="planner-grid"><label>Journey type<select value={form.kind} onChange={(e) => update("kind", e.target.value as PlannerState["kind"])}><option value="personal">Personal holiday</option><option value="corporate">Business travel</option><option value="event">Meeting or event</option></select></label><label>Starting from<input value={form.origin} onChange={(e) => update("origin", e.target.value)} required /></label><label>Destination<input value={form.destination} onChange={(e) => update("destination", e.target.value)} required placeholder="Country, city or a feeling" /></label><span /><label>Departure<input type="date" min={new Date().toISOString().slice(0,10)} value={form.departureDate} onChange={(e) => update("departureDate", e.target.value)} required /></label><label>Return<input type="date" min={form.departureDate || new Date().toISOString().slice(0,10)} value={form.returnDate} onChange={(e) => update("returnDate", e.target.value)} required /></label></div></fieldset>}
    {step === 2 && <fieldset><legend>Who is traveling?</legend><p>Give us a practical starting point for comfort and budget.</p><div className="planner-grid"><label>Travelers<input type="number" min="1" max="100" value={form.travelerCount} onChange={(e) => update("travelerCount", e.target.value)} required /></label><label>Budget currency<select value={form.currency} onChange={(e) => update("currency", e.target.value as PlannerState["currency"])}><option>KES</option><option>USD</option></select></label><label className="wide">Approximate total budget<input type="number" min="0" value={form.budget} onChange={(e) => update("budget", e.target.value)} placeholder="Optional" /></label></div><div className="interest-list">{["Culture", "Food", "Safari", "Beach", "Wellness", "Adventure", "Family", "Romance", "Business"].map((item) => <button type="button" className={form.interests.includes(item) ? "active" : ""} key={item} onClick={() => toggleInterest(item)}>{item}</button>)}</div></fieldset>}
    {step === 3 && <fieldset><legend>How can we reach you?</legend><p>Your details stay with TVSE and the specialists working on your journey.</p><div className="planner-grid"><label>Your name<input value={form.contactName} onChange={(e) => update("contactName", e.target.value)} required /></label><label>Email address<input type="email" value={form.contactEmail} onChange={(e) => update("contactEmail", e.target.value)} required /></label><label>Phone / WhatsApp<input value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} /></label><label className="wide">Anything else we should know?<textarea rows={4} value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Occasion, preferred pace, accessibility, special interests…" /></label></div></fieldset>}
    {step === 4 && <fieldset><legend>Ready for TVSE.</legend><div className="planner-review"><div><span>Journey</span><strong>{form.origin} → {form.destination}</strong><small>{form.departureDate} to {form.returnDate}</small></div><div><span>Travelers</span><strong>{form.travelerCount} people</strong><small>{form.interests.join(" · ") || "Open to ideas"}</small></div><div><span>Contact</span><strong>{form.contactName}</strong><small>{form.contactEmail}</small></div></div><label className="planner-consent"><input type="checkbox" required /> I agree that TVSE may use these details to prepare and communicate about my travel request.</label><TurnstileField /></fieldset>}
    {error && <p className="planner-error" role="alert">{error}</p>}<div className="planner-actions">{step > 1 && <button className="pill outline" type="button" onClick={() => setStep((value) => value - 1)}>Back</button>}{step < 4 ? <button className="pill primary" type="button" onClick={next}>Continue <span>→</span></button> : <button className="pill primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Send travel brief"}<span>→</span></button>}</div>
  </form>;
}

const enquiryServices = [
  { id: "ticketing", title: "Flights & ticketing", text: "Research, reservations, ticket changes and travel support." },
  { id: "accommodation", title: "Accommodation", text: "Hotels, resorts and private stays matched to your priorities." },
  { id: "airport-transfer", title: "Airport transfers", text: "Reliable pickups, drop-offs and connection planning." },
  { id: "car-rental", title: "Car rental", text: "Self-drive or chauffeured vehicles for any route or group." },
  { id: "safaris", title: "Safaris & holidays", text: "Tailor-made escapes, wildlife journeys and complete packages." },
  { id: "delivery", title: "Delivery services", text: "Coordinated movement of documents, parcels and essentials." },
  { id: "corporate", title: "Corporate travel", text: "Managed business trips, approvals and traveler support." },
  { id: "events", title: "Meetings & events", text: "Group movement, venues and end-to-end event logistics." },
  { id: "consulting", title: "Travel consulting", text: "Program design, supplier strategy and practical travel advice." },
] as const;

type ServiceId = (typeof enquiryServices)[number]["id"];
type EnquiryKind = "personal" | "corporate" | "event";
type EnquiryState = {
  kind: EnquiryKind;
  services: ServiceId[];
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  flexibleDates: boolean;
  travelerCount: string;
  budget: string;
  currency: "KES" | "USD";
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  company: string;
  contactPreference: "WhatsApp" | "Email" | "Phone call";
  notes: string;
};

const emptyEnquiry: EnquiryState = {
  kind: "personal",
  services: [],
  origin: "Nairobi",
  destination: "",
  startDate: "",
  endDate: "",
  flexibleDates: false,
  travelerCount: "2",
  budget: "",
  currency: "KES",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  company: "",
  contactPreference: "WhatsApp",
  notes: "",
};

const serviceAliases: Record<string, ServiceId> = {
  flight: "ticketing",
  flights: "ticketing",
  ticket: "ticketing",
  safari: "safaris",
  holiday: "safaris",
  transfer: "airport-transfer",
  transfers: "airport-transfer",
  rental: "car-rental",
  business: "corporate",
  event: "events",
};

const enquiryKinds: Array<{ id: EnquiryKind; label: string }> = [
  { id: "personal", label: "Personal" },
  { id: "corporate", label: "Business" },
  { id: "event", label: "Meeting or event" },
];

function resolveService(value = ""): ServiceId | null {
  const normalized = value.trim().toLowerCase();
  return enquiryServices.find((service) => service.id === normalized)?.id || serviceAliases[normalized] || null;
}

export function TripPlanner({ defaultDestination = "", defaultService = "", destinationSlug, packageSlug }: { defaultDestination?: string; defaultService?: string; destinationSlug?: string; packageSlug?: string }) {
  const initialService = resolveService(defaultService);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<EnquiryState>(() => ({ ...emptyEnquiry, destination: defaultDestination, services: initialService ? [initialService] : [] }));
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const contactLinks = usePublicContactLinks();
  const today = new Date().toISOString().slice(0, 10);
  const selectedServices = enquiryServices.filter((service) => form.services.includes(service.id));
  const deliveryOnly = form.services.length === 1 && form.services[0] === "delivery";
  const kindLabel = form.kind === "personal" ? "Personal travel" : form.kind === "corporate" ? "Business travel" : "Meeting or event";

  const update = <K extends keyof EnquiryState>(key: K, value: EnquiryState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const toggleService = (service: ServiceId) => update("services", form.services.includes(service) ? form.services.filter((item) => item !== service) : [...form.services, service]);
  const goToStep = (target: number) => { if (target < step) { setError(""); setStep(target); } };
  const next = () => {
    setError("");
    if (step === 1 && form.services.length === 0) return setError("Choose at least one service so we can route your enquiry correctly.");
    if (step === 2) {
      if (deliveryOnly && !form.origin.trim()) return setError("Add the pickup area to continue.");
      if (!form.destination.trim()) return setError(deliveryOnly ? "Add the delivery area to continue." : "Add the destination or service area to continue.");
      if (!form.flexibleDates && !form.startDate) return setError("Choose a preferred date or mark your dates as flexible.");
      if (form.startDate && form.endDate && form.endDate < form.startDate) return setError("The end date must be on or after the start date.");
      if (!deliveryOnly && Number(form.travelerCount) < 1) return setError("Tell us how many people need this service.");
    }
    if (step === 3) {
      if (!form.contactName.trim() || !form.contactEmail.trim()) return setError("Add your name and email address to continue.");
      if (form.contactPreference !== "Email" && !form.contactPhone.trim()) return setError(`Add a phone number so we can contact you by ${form.contactPreference.toLowerCase()}.`);
    }
    setStep((value) => Math.min(4, value + 1));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const formElement = event.currentTarget;
    const submissionKey = formElement.dataset.submissionKey ||= crypto.randomUUID();
    const message = [
      `Services requested: ${selectedServices.map((service) => service.title).join(", ")}`,
      `Enquiry type: ${kindLabel}`,
      `From / pickup: ${form.origin || "Not supplied"}`,
      `Destination / delivery area: ${form.destination || "Not supplied"}`,
      `Timing: ${form.flexibleDates ? "Flexible" : [form.startDate, form.endDate].filter(Boolean).join(" to ") || "Not supplied"}`,
      `Travelers / guests: ${deliveryOnly ? "Not applicable" : form.travelerCount}`,
      `Budget guide: ${form.budget ? `${form.currency} ${form.budget}` : "Not supplied"}`,
      `Preferred contact: ${form.contactPreference}`,
      `Additional details: ${form.notes || "No additional notes supplied."}`,
    ].join("\n");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": submissionKey },
        body: JSON.stringify({
          name: form.contactName,
          email: form.contactEmail,
          phone: form.contactPhone,
          company: form.company,
          type: form.kind === "personal" ? "personal" : "corporate",
          message,
          consent: true,
          consentVersion: "2026-08",
          marketing: currentMarketingContext({ destinationSlug, packageSlug }),
          turnstileToken: readTurnstileToken(formElement),
        }),
      });
      const payload = await response.json() as { data?: { message?: string }; error?: string };
      if (!response.ok) throw new Error(payload.error || "We could not send your enquiry.");
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not send your enquiry.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) return <section className="enquiry-success" role="status"><span aria-hidden="true">&#10003;</span><p className="campaign-kicker">ENQUIRY RECEIVED</p><h2>Thank you, {form.contactName.split(" ")[0]}.</h2><p>Your request for {selectedServices.map((service) => service.title).join(", ")} is with TVSE. A specialist will follow up using your preferred contact method.</p><div><Link className="pill primary" href="/">Return home</Link>{contactLinks.whatsapp && <a className="pill outline" href={`https://wa.me/${contactLinks.whatsapp}?text=${encodeURIComponent("Hello TVSE, I have just submitted a service enquiry.")}`}>Continue on WhatsApp</a>}</div></section>;

  const progress = ["Services", "Details", "Contact", "Review"];
  return <form className="service-enquiry" onSubmit={submit}>
    <aside className="enquiry-aside">
      <div><span>TVSE CONCIERGE</span><h2>One brief.<br />The right specialists.</h2><p>Select one service or combine everything you need. We will coordinate the response around you.</p></div>
      <ol><li><b>01</b><span>Tell us what you need</span></li><li><b>02</b><span>We match the right team</span></li><li><b>03</b><span>You receive a clear next step</span></li></ol>
      <div className="enquiry-help"><span>Prefer to write directly?</span><a href={`mailto:${contactLinks.email}`}>{contactLinks.email}</a></div>
    </aside>
    <div className="enquiry-main">
      <div className="enquiry-progress" aria-label={`Step ${step} of 4`}>{progress.map((label, index) => { const number = index + 1; return <button type="button" key={label} className={number === step ? "current" : number < step ? "complete" : ""} onClick={() => goToStep(number)} aria-current={number === step ? "step" : undefined} aria-label={`${label}, step ${number}`}><span>0{number}</span><b>{label}</b></button>; })}</div>

      {step === 1 && <fieldset><legend>What can we arrange?</legend><p>Choose every service you need. You can combine flights, stays, transport and experiences in one enquiry.</p><div className="enquiry-kind-options" aria-label="Enquiry type">{enquiryKinds.map((kind) => <button type="button" key={kind.id} className={form.kind === kind.id ? "active" : ""} onClick={() => update("kind", kind.id)} aria-pressed={form.kind === kind.id}>{kind.label}</button>)}</div><div className="service-choice-grid">{enquiryServices.map((service, index) => { const active = form.services.includes(service.id); return <button type="button" key={service.id} className={active ? "active" : ""} onClick={() => toggleService(service.id)} aria-pressed={active}><span>0{index + 1}</span><strong>{service.title}</strong><small>{service.text}</small><i aria-hidden="true">{active ? "✓" : "+"}</i></button>; })}</div></fieldset>}

      {step === 2 && <fieldset><legend>{deliveryOnly ? "Where should it go?" : "Share the essentials."}</legend><p>{deliveryOnly ? "Give us the pickup, delivery area and preferred timing." : "A practical starting point is enough. We will help refine the details."}</p><div className="enquiry-field-grid"><label>{deliveryOnly ? "Pickup area" : "Starting from"}<input value={form.origin} onChange={(event) => update("origin", event.target.value)} placeholder={deliveryOnly ? "Collection address or area" : "City or airport"} /></label><label>{deliveryOnly ? "Delivery area" : "Destination / service area"}<input value={form.destination} onChange={(event) => update("destination", event.target.value)} placeholder={deliveryOnly ? "Delivery address or area" : "City, country or route"} /></label><label>{deliveryOnly ? "Preferred delivery date" : "Start / departure date"}<input type="date" min={today} value={form.startDate} onChange={(event) => update("startDate", event.target.value)} disabled={form.flexibleDates} /></label>{!deliveryOnly && <label>End / return date<input type="date" min={form.startDate || today} value={form.endDate} onChange={(event) => update("endDate", event.target.value)} disabled={form.flexibleDates} /></label>}<label className="enquiry-check wide"><input type="checkbox" checked={form.flexibleDates} onChange={(event) => update("flexibleDates", event.target.checked)} /><span>My dates are flexible</span></label>{!deliveryOnly && <label>Travelers / guests<input type="number" min="1" max="500" value={form.travelerCount} onChange={(event) => update("travelerCount", event.target.value)} /></label>}<label>Budget currency<select value={form.currency} onChange={(event) => update("currency", event.target.value as EnquiryState["currency"])}><option>KES</option><option>USD</option></select></label><label className="wide">Approximate budget, if known<input type="number" min="0" value={form.budget} onChange={(event) => update("budget", event.target.value)} placeholder="Optional" /></label></div></fieldset>}

      {step === 3 && <fieldset><legend>How should we reach you?</legend><p>Share the best contact details and anything that will help us prepare a useful response.</p><div className="enquiry-field-grid"><label>Your name<input value={form.contactName} onChange={(event) => update("contactName", event.target.value)} autoComplete="name" /></label><label>Email address<input type="email" value={form.contactEmail} onChange={(event) => update("contactEmail", event.target.value)} autoComplete="email" /></label><label>Phone / WhatsApp<input value={form.contactPhone} onChange={(event) => update("contactPhone", event.target.value)} autoComplete="tel" placeholder="Include country code" /></label><label>Company, if applicable<input value={form.company} onChange={(event) => update("company", event.target.value)} autoComplete="organization" /></label><label>Preferred contact<select value={form.contactPreference} onChange={(event) => update("contactPreference", event.target.value as EnquiryState["contactPreference"])}><option>WhatsApp</option><option>Email</option><option>Phone call</option></select></label><label className="wide">Tell us anything else<textarea rows={5} value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Flight preferences, room style, vehicle type, special occasion, accessibility needs or delivery details…" /></label></div></fieldset>}

      {step === 4 && <fieldset><legend>Review your enquiry.</legend><p>Check the essentials, then send your brief securely to the TVSE team.</p><div className="enquiry-review"><section><span>Services</span><div>{selectedServices.map((service) => <strong key={service.id}>{service.title}</strong>)}</div></section><section><span>Request</span><strong>{kindLabel}</strong><small>{form.origin || "Starting point open"} &rarr; {form.destination}</small></section><section><span>Timing</span><strong>{form.flexibleDates ? "Flexible dates" : form.startDate || "To be discussed"}</strong><small>{!deliveryOnly && `${form.travelerCount} traveler${form.travelerCount === "1" ? "" : "s"}`}</small></section><section><span>Contact</span><strong>{form.contactName}</strong><small>{form.contactPreference} &middot; {form.contactEmail}</small></section></div><label className="planner-consent"><input type="checkbox" required /> I agree that TVSE may use these details to respond to and coordinate my enquiry.</label><TurnstileField /></fieldset>}

      {error && <p className="planner-error" role="alert">{error}</p>}
      <div className="planner-actions">{step > 1 && <button className="pill outline" type="button" onClick={() => setStep((value) => value - 1)}>Back</button>}{step < 4 ? <button className="pill primary" type="button" onClick={next}>Continue <span>&rarr;</span></button> : <button className="pill primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Send enquiry"}<span>&rarr;</span></button>}</div>
    </div>
  </form>;
}
