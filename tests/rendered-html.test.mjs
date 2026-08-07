import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the TVSE travel experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>TVSE Travel \| Remarkable journeys, made personal<\/title>/i);
  assert.match(html, /Remarkable journeys/);
  assert.match(html, /Made personal/);
  assert.match(html, /hero-device-stage/);
  assert.match(html, /hero-phone-transparent\.png/);
  assert.match(html, /Featured airlines/);
  assert.match(html, /Kenya Airways/);
  assert.match(html, /airline-marquee-track/);
  assert.doesNotMatch(html, /destinations in our current catalog/);
  assert.doesNotMatch(html, /Your island itinerary is ready|FEATURED ESCAPE/);
  assert.match(html, /Maasai Mara/);
  assert.match(html, /Let(?:&#x27;|')s go somewhere/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Your site is taking shape/i);
});

test("server-renders every header destination", async () => {
  const destinations = [
    ["/solutions/booking-trip-management", "A traveler experience", "layout-solutions-booking-trip-management"],
    ["/solutions/program-payment-insights", "Every journey", "layout-solutions-program-payment-insights"],
    ["/solutions/meetings-events", "Meetings and events", "layout-solutions-meetings-events"],
    ["/solutions/consulting", "Smarter travel", "layout-solutions-consulting"],
    ["/technology/platform", "Control, choice and calm", "layout-technology-platform"],
    ["/technology/marketplace", "More trusted partners", "layout-technology-marketplace"],
    ["/technology/apis-data", "Travel data", "layout-technology-apis-data"],
    ["/resources", "Travel ideas that take you further", "resources-live-page"],
    ["/resources/blog", "Blog", "resources-live-page"],
    ["/resources/guides", "How To Guides", "resources-live-page"],
    ["/login/traveler", "Your trip, all in one place", "portal-layout-login-traveler"],
    ["/login/business", "Manage your team", "portal-layout-login-business"],
    ["/login/partner", "Connect with TVSE", "portal-layout-login-partner"],
    ["/contact", "How can we help you", "contact-reference-page"],
  ];

  for (const [path, expected, layoutClass] of destinations) {
    const response = await render(path);
    assert.equal(response.status, 200, `${path} should render successfully`);
    const html = await response.text();
    assert.match(html, new RegExp(expected, "i"), `${path} should contain its page heading`);
    assert.match(html, new RegExp(layoutClass, "i"), `${path} should use its page-specific layout`);
  }
});

test("search, resource detail pages and discovery files render", async () => {
  const pages = [
    ["/search?q=zanzibar", "Zanzibar beyond the beach"],
    ["/resources/blog/zanzibar-beyond-the-beach", "Culture, food and island history"],
    ["/resources/guides/build-a-travel-policy", "Practical guardrails"],
    ["/sitemap.xml", "destinations/zanzibar"],
    ["/robots.txt", "Disallow: /staff/"],
  ];
  for (const [path, expected] of pages) {
    const response = await render(path);
    assert.equal(response.status, 200, `${path} should render successfully`);
    assert.match(await response.text(), new RegExp(expected, "i"));
  }
});

test("server-renders the public travel catalog and planning pages", async () => {
  const pages = [
    ["/destinations", "Places worth traveling for"],
    ["/destinations/zanzibar", "A journey with room to become yours"],
    ["/packages", "Journeys with a head start"],
    ["/packages/zanzibar-culture-and-coast", "Personalize this journey"],
    ["/plan-a-trip", "Tell us the idea"],
    ["/corporate", "Business travel, made more human"],
    ["/about", "Travel feels better"],
    ["/faq", "A little clarity before takeoff"],
    ["/support", "Help that stays with the journey"],
    ["/privacy", "Privacy"],
    ["/terms", "Terms"],
    ["/cookies", "Cookies"],
  ];
  for (const [path, expected] of pages) {
    const response = await render(path);
    assert.equal(response.status, 200, `${path} should render successfully`);
    assert.match(await response.text(), new RegExp(expected, "i"));
  }
});

test("operational workspaces are protected", async () => {
  for (const path of ["/portal", "/business", "/partner", "/staff"]) {
    const response = await render(path);
    assert.ok([302, 303, 307, 308].includes(response.status), `${path} should redirect unauthenticated visitors`);
    assert.match(response.headers.get("location") ?? "", /login|signin|auth\/signin/i);
  }
});
