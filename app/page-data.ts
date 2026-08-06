export type PageVariant = "detail" | "resources" | "portal" | "contact";
export type PageTone = "purple" | "orange" | "navy" | "green";

export type Feature = {
  title: string;
  text: string;
};

export type ResourceCard = {
  label: string;
  title: string;
  text: string;
  image: string;
};

export type TvsePage = {
  path: string;
  variant: PageVariant;
  tone: PageTone;
  eyebrow: string;
  heroTitle: string;
  intro: string;
  ctaLabel: string;
  heroImage: string;
  sectionEyebrow: string;
  sectionTitle: string;
  sectionText: string;
  metric: string;
  metricLabel: string;
  features: Feature[];
  cards?: ResourceCard[];
};

const commonResources: ResourceCard[] = [
  {
    label: "TRAVEL INTELLIGENCE",
    title: "East Africa travel outlook: what to expect this season",
    text: "A practical view of routes, demand, lead times and the opportunities shaping travel from Nairobi.",
    image: "/maasai-mara.jpg",
  },
  {
    label: "SMARTER SPEND",
    title: "Seven ways to make every business trip work harder",
    text: "Simple planning choices that protect budgets without compromising the traveler experience.",
    image: "/cape-town.jpg",
  },
  {
    label: "DESTINATION GUIDE",
    title: "Zanzibar beyond the beach",
    text: "Culture, food, history and island experiences worth adding to your next itinerary.",
    image: "/hero-zanzibar.jpg",
  },
  {
    label: "HOW TO",
    title: "Build a travel policy people will actually use",
    text: "Create practical guardrails that support travelers, managers and finance teams alike.",
    image: "/bali.jpg",
  },
  {
    label: "TRAVEL WELL",
    title: "A calmer way to handle disrupted journeys",
    text: "How preparation, clear communication and human support keep plans moving.",
    image: "/santorini.jpg",
  },
  {
    label: "SAFARI PLANNING",
    title: "When to book the Maasai Mara",
    text: "A month-by-month guide to wildlife, weather, crowds and the best kind of stay for you.",
    image: "/maasai-mara.jpg",
  },
];

export const pages: Record<string, TvsePage> = {
  "solutions/booking-trip-management": {
    path: "/solutions/booking-trip-management",
    variant: "detail",
    tone: "orange",
    eyebrow: "Booking & trip management",
    heroTitle: "A traveler experience that feels completely personal",
    intro: "TVSE brings flights, stays, transfers, itineraries and real human support into one calm, connected journey.",
    ctaLabel: "Plan a journey",
    heroImage: "/cape-town.jpg",
    sectionEyebrow: "Freedom with confidence",
    sectionTitle: "Every detail in one place. Support at every turn.",
    sectionText: "Travel is personal. Choose self-service convenience when plans are simple, and reach an experienced TVSE travel specialist whenever the journey needs a human touch.",
    metric: "24/7",
    metricLabel: "traveler assistance",
    features: [
      { title: "More choice", text: "Compare trusted flight, stay and transfer options shaped around the trip." },
      { title: "One clear itinerary", text: "Every booking, document and update stays organized in one travel plan." },
      { title: "Right-time guidance", text: "Useful reminders and destination advice arrive before you need to ask." },
      { title: "Human backup", text: "When plans change, a real TVSE specialist helps find the next best move." },
    ],
  },
  "solutions/program-payment-insights": {
    path: "/solutions/program-payment-insights",
    variant: "detail",
    tone: "purple",
    eyebrow: "Program & payment insights",
    heroTitle: "Every journey. One clear view.",
    intro: "Bring bookings, traveler activity and travel spend together to make faster, more confident program decisions.",
    ctaLabel: "Talk to our team",
    heroImage: "/bali.jpg",
    sectionEyebrow: "Clarity that moves",
    sectionTitle: "See where travel spend goes and where value can grow.",
    sectionText: "TVSE turns fragmented trip and payment information into a practical program view, helping teams spot savings, strengthen policy and support travelers with less manual work.",
    metric: "1 view",
    metricLabel: "across travel and spend",
    features: [
      { title: "Spend visibility", text: "Understand travel costs across routes, teams, suppliers and payment methods." },
      { title: "Traveler wellbeing", text: "Identify demanding itineraries and make better choices for your people." },
      { title: "Policy performance", text: "See where travelers need clearer options, guidance or approval flows." },
      { title: "Sustainability signals", text: "Track route choices and build practical lower-impact travel habits." },
    ],
  },
  "solutions/meetings-events": {
    path: "/solutions/meetings-events",
    variant: "detail",
    tone: "green",
    eyebrow: "Meetings & events",
    heroTitle: "Meetings and events people remember",
    intro: "From leadership retreats to incentive journeys and conferences, TVSE turns your idea into a seamless shared experience.",
    ctaLabel: "Design an event",
    heroImage: "/santorini.jpg",
    sectionEyebrow: "Designed around the moment",
    sectionTitle: "Bring people together with purpose and personality.",
    sectionText: "Our team coordinates the venue, travel, guest experience and on-the-ground details so every participant feels considered and every moment supports your goal.",
    metric: "End to end",
    metricLabel: "event coordination",
    features: [
      { title: "Venue sourcing", text: "Shortlists that fit your audience, agenda, access needs and budget." },
      { title: "Guest travel", text: "Coordinated flights, transfers, stays and traveler communications." },
      { title: "Experience design", text: "Local ideas and thoughtful details that give the occasion a clear identity." },
      { title: "On-site support", text: "A calm team on the ground to keep timing, people and suppliers aligned." },
    ],
  },
  "solutions/consulting": {
    path: "/solutions/consulting",
    variant: "detail",
    tone: "navy",
    eyebrow: "Travel consulting",
    heroTitle: "Smarter travel starts with a better plan",
    intro: "Turn travel complexity into a practical program that balances savings, service, traveler care and long-term goals.",
    ctaLabel: "Start a conversation",
    heroImage: "/maasai-mara.jpg",
    sectionEyebrow: "Strategy built for reality",
    sectionTitle: "Make travel work better for the people who use and manage it.",
    sectionText: "TVSE combines local market knowledge, supplier insight and a people-first view to improve sourcing, policy, traveler engagement and program performance.",
    metric: "Always",
    metricLabel: "focused on measurable value",
    features: [
      { title: "Program design", text: "Build the right service model, approval flow and traveler experience." },
      { title: "Supplier strategy", text: "Focus negotiations on the routes, rooms and services that matter most." },
      { title: "Traveler engagement", text: "Turn policy into clear choices and useful guidance people understand." },
      { title: "Continuous improvement", text: "Review performance regularly and act on new savings and service opportunities." },
    ],
  },
  "technology/platform": {
    path: "/technology/platform",
    variant: "detail",
    tone: "purple",
    eyebrow: "TVSE platform",
    heroTitle: "Control, choice and calm in one connected platform",
    intro: "A travel workspace designed to help travelers, arrangers and managers plan, act and stay informed from one place.",
    ctaLabel: "Explore the platform",
    heroImage: "/hero-zanzibar.jpg",
    sectionEyebrow: "Travel managed your way",
    sectionTitle: "Plan, book and manage every trip with less friction.",
    sectionText: "TVSE connects curated content, traveler support, approvals, communications and reporting in a flexible experience that grows with your program.",
    metric: "One place",
    metricLabel: "for every journey",
    features: [
      { title: "Curated content", text: "Relevant travel options from trusted global and regional partners." },
      { title: "Smart configuration", text: "Clear travel rules, approvals and service preferences across your organization." },
      { title: "Connected support", text: "Travelers and arrangers share the same up-to-date trip information." },
      { title: "Useful insight", text: "Practical program signals help teams make better decisions faster." },
    ],
  },
  "technology/marketplace": {
    path: "/technology/marketplace",
    variant: "detail",
    tone: "orange",
    eyebrow: "TVSE partner marketplace",
    heroTitle: "More trusted partners. More ways to travel well.",
    intro: "Extend your travel program with carefully selected specialists across payments, safety, mobility, visas and traveler experience.",
    ctaLabel: "Explore partners",
    heroImage: "/santorini.jpg",
    sectionEyebrow: "Choice without the guesswork",
    sectionTitle: "Build the travel ecosystem your people actually need.",
    sectionText: "We evaluate every partner for service quality, regional fit and traveler value, giving TVSE clients the freedom to add capabilities without adding complexity.",
    metric: "40+",
    metricLabel: "curated destination partners",
    features: [
      { title: "Payments", text: "Secure corporate, virtual and traveler-friendly payment options." },
      { title: "Travel risk", text: "Destination intelligence, alerts and support for changing conditions." },
      { title: "Visa services", text: "Clear requirements, document support and less last-minute uncertainty." },
      { title: "Traveler services", text: "Wellness, mobility, connectivity and thoughtful extras on the road." },
    ],
  },
  "technology/apis-data": {
    path: "/technology/apis-data",
    variant: "detail",
    tone: "navy",
    eyebrow: "APIs & data",
    heroTitle: "Travel data that moves with your business",
    intro: "Connect itinerary, traveler, booking and reporting information to the systems your teams already use.",
    ctaLabel: "Discuss an integration",
    heroImage: "/bali.jpg",
    sectionEyebrow: "Built to connect",
    sectionTitle: "Make travel information useful wherever work happens.",
    sectionText: "TVSE integration services help corporate teams connect travel workflows with HR, finance, security and communication tools through practical, secure data exchanges.",
    metric: "API-ready",
    metricLabel: "integration support",
    features: [
      { title: "Itinerary data", text: "Keep journey details synchronized across traveler and company tools." },
      { title: "Profile connections", text: "Reduce duplicate work with consistent traveler preferences and information." },
      { title: "Finance exports", text: "Move booking and payment data into reporting and reconciliation workflows." },
      { title: "Risk signals", text: "Share location-aware trip information with duty-of-care processes." },
    ],
  },
  resources: {
    path: "/resources",
    variant: "resources",
    tone: "purple",
    eyebrow: "TVSE resources",
    heroTitle: "Ideas for better journeys",
    intro: "Destination intelligence, practical planning advice and clear travel program guidance from the TVSE team.",
    ctaLabel: "Explore the latest",
    heroImage: "/cape-town.jpg",
    sectionEyebrow: "Latest insights",
    sectionTitle: "Guides, stories and practical travel intelligence",
    sectionText: "Useful thinking for holidaymakers, business travelers and the teams that keep them moving.",
    metric: "Local insight",
    metricLabel: "with a global view",
    features: [],
    cards: commonResources,
  },
  "resources/blog": {
    path: "/resources/blog",
    variant: "resources",
    tone: "orange",
    eyebrow: "TVSE blog",
    heroTitle: "Stories from the road and the people behind them",
    intro: "Fresh inspiration, destination notes and honest travel observations from Nairobi to the world.",
    ctaLabel: "Read the latest",
    heroImage: "/hero-zanzibar.jpg",
    sectionEyebrow: "From the TVSE journal",
    sectionTitle: "The places, ideas and details shaping travel now",
    sectionText: "Thoughtful reads for curious travelers and teams planning what comes next.",
    metric: "New stories",
    metricLabel: "added regularly",
    features: [],
    cards: [commonResources[2], commonResources[5], commonResources[4], commonResources[0], commonResources[1], commonResources[3]],
  },
  "resources/guides": {
    path: "/resources/guides",
    variant: "resources",
    tone: "green",
    eyebrow: "How-to guides",
    heroTitle: "Practical guides for confident travel",
    intro: "Clear, useful advice for planning, booking, budgeting and staying supported on every kind of trip.",
    ctaLabel: "Browse all guides",
    heroImage: "/maasai-mara.jpg",
    sectionEyebrow: "Make the next step easier",
    sectionTitle: "Travel know-how you can put to work today",
    sectionText: "Straightforward guidance designed for travelers, arrangers and business travel teams.",
    metric: "Step by step",
    metricLabel: "planning support",
    features: [],
    cards: [commonResources[3], commonResources[4], commonResources[5], commonResources[1], commonResources[2], commonResources[0]],
  },
  "login/traveler": {
    path: "/login/traveler",
    variant: "portal",
    tone: "purple",
    eyebrow: "Traveler portal",
    heroTitle: "Your trip, all in one place",
    intro: "View upcoming journeys, travel documents, support details and the latest updates from your TVSE travel team.",
    ctaLabel: "Open traveler portal",
    heroImage: "/hero-zanzibar.jpg",
    sectionEyebrow: "Travel with confidence",
    sectionTitle: "Everything you need before, during and after the journey.",
    sectionText: "Sign in with the email used for your booking. If you need urgent help, the support details on your itinerary remain available 24/7.",
    metric: "24/7",
    metricLabel: "trip assistance",
    features: [
      { title: "Live itinerary", text: "See flights, stays, transfers and confirmations in one timeline." },
      { title: "Travel documents", text: "Keep important vouchers and booking details close at hand." },
      { title: "Helpful alerts", text: "Receive relevant trip updates and destination reminders." },
      { title: "Human support", text: "Reach the TVSE team whenever your plans need attention." },
    ],
  },
  "login/business": {
    path: "/login/business",
    variant: "portal",
    tone: "navy",
    eyebrow: "Business account",
    heroTitle: "Manage your team's travel with clarity",
    intro: "Review journeys, approvals, traveler support needs and program activity from a single TVSE workspace.",
    ctaLabel: "Open business account",
    heroImage: "/cape-town.jpg",
    sectionEyebrow: "One connected workspace",
    sectionTitle: "Keep travelers moving and decision-makers informed.",
    sectionText: "The TVSE business account is designed for travel arrangers, team leads and finance partners who need a clear view of active and upcoming travel.",
    metric: "One team",
    metricLabel: "across every journey",
    features: [
      { title: "Approvals", text: "Keep requests, decisions and traveler communication aligned." },
      { title: "Program view", text: "Understand booking activity and the trips that need attention." },
      { title: "Traveler care", text: "See active journeys and connect people with support quickly." },
      { title: "Reporting", text: "Access clear booking and spend summaries for your team." },
    ],
  },
  "login/partner": {
    path: "/login/partner",
    variant: "portal",
    tone: "green",
    eyebrow: "Partner connect",
    heroTitle: "Connect with TVSE",
    intro: "A dedicated space for hotels, operators, guides and service partners working with TVSE travelers.",
    ctaLabel: "Open partner connect",
    heroImage: "/santorini.jpg",
    sectionEyebrow: "Better journeys together",
    sectionTitle: "Keep bookings, guest details and service updates aligned.",
    sectionText: "TVSE Partner Connect helps our trusted network coordinate arrivals, confirmations and experience details with less back-and-forth.",
    metric: "Trusted",
    metricLabel: "partner collaboration",
    features: [
      { title: "Booking updates", text: "Review relevant reservation details and operational changes." },
      { title: "Guest readiness", text: "Prepare thoughtful service around the traveler information provided." },
      { title: "Experience details", text: "Keep inclusions, timings and meeting points easy to understand." },
      { title: "Direct coordination", text: "Reach the right TVSE specialist when a booking needs attention." },
    ],
  },
  contact: {
    path: "/contact",
    variant: "contact",
    tone: "orange",
    eyebrow: "Get started",
    heroTitle: "How can we help you travel?",
    intro: "Tell us what you are planning or what support you need. We will connect you with the right TVSE travel specialist.",
    ctaLabel: "Choose how we can help",
    heroImage: "/hero-zanzibar.jpg",
    sectionEyebrow: "Start the conversation",
    sectionTitle: "A real person. A clear next step.",
    sectionText: "Whether it is one remarkable holiday or an entire corporate program, TVSE starts by listening to what matters most.",
    metric: "Nairobi",
    metricLabel: "serving travelers worldwide",
    features: [
      { title: "I am planning a personal trip", text: "Create a tailor-made holiday, safari or special escape." },
      { title: "I need help with my journey", text: "Get support for an active or upcoming TVSE booking." },
      { title: "I am exploring business travel", text: "Build a clearer travel program for your organization." },
      { title: "I want to partner with TVSE", text: "Introduce your property, service or destination experience." },
    ],
  },
};

export const pageList = Object.values(pages);
