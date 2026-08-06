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
  assert.match(html, /Maasai Mara/);
  assert.match(html, /Let(?:&#x27;|')s go somewhere/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Your site is taking shape/i);
});

test("server-renders every header destination", async () => {
  const destinations = [
    ["/solutions/booking-trip-management", "A traveler experience"],
    ["/solutions/program-payment-insights", "Every journey"],
    ["/solutions/meetings-events", "Meetings and events"],
    ["/solutions/consulting", "Smarter travel"],
    ["/technology/platform", "Control, choice and calm"],
    ["/technology/marketplace", "More trusted partners"],
    ["/technology/apis-data", "Travel data"],
    ["/resources", "Ideas for better journeys"],
    ["/resources/blog", "Stories from the road"],
    ["/resources/guides", "Practical guides"],
    ["/login/traveler", "Your trip, all in one place"],
    ["/login/business", "Manage your team"],
    ["/login/partner", "Connect with TVSE"],
    ["/contact", "How can we help you travel"],
  ];

  for (const [path, expected] of destinations) {
    const response = await render(path);
    assert.equal(response.status, 200, `${path} should render successfully`);
    const html = await response.text();
    assert.match(html, new RegExp(expected, "i"), `${path} should contain its page heading`);
  }
});
