import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canAccessResource,
  canOverrideTenant,
  reportScopeForRole,
} from "../lib/authorization.ts";
import { parseJson } from "../lib/http.ts";
import { createServiceHeaders, sha256Hex, verifyServiceRequest } from "../lib/service-auth.ts";
import { contentSchema, paymentSchema, tripRequestSchema } from "../lib/validation.ts";

const roles = ["owner", "admin", "agent", "finance", "content", "traveler", "corporate_requester", "corporate_approver", "partner"];

test("the shared role/resource matrix denies every unlisted read", () => {
  const expected = {
    requests: ["owner", "admin", "agent", "traveler", "corporate_requester", "corporate_approver"],
    quotes: ["owner", "admin", "agent", "finance", "traveler", "corporate_requester", "corporate_approver"],
    bookings: ["owner", "admin", "agent", "finance", "traveler", "corporate_requester", "corporate_approver"],
    invoices: ["owner", "admin", "finance", "traveler", "corporate_requester", "corporate_approver"],
    support: ["owner", "admin", "agent", "traveler", "corporate_requester", "corporate_approver", "partner"],
    leads: ["owner", "admin", "agent"], approvals: ["owner", "admin", "agent", "corporate_approver"], assignments: ["owner", "admin", "agent", "partner"],
    notifications: ["owner", "admin"], audit: ["owner", "admin"], users: ["owner", "admin"],
    organizations: ["owner", "admin", "agent", "finance"], suppliers: ["owner", "admin", "agent"], content: ["owner", "admin", "content"],
  };
  for (const [resource, allowed] of Object.entries(expected)) {
    for (const role of roles) assert.equal(canAccessResource(role, resource), allowed.includes(role), `${role} -> ${resource}`);
  }
});

test("the shared role/resource matrix denies every unlisted mutation and decision", () => {
  const mutable = {
    requests: ["owner", "admin", "agent"], quotes: ["owner", "admin", "agent"], bookings: ["owner", "admin", "agent"],
    invoices: ["owner", "admin", "finance"], receipts: ["owner", "admin", "finance"], support: ["owner", "admin", "agent"],
    leads: ["owner", "admin", "agent"], approvals: ["owner", "admin", "agent"], assignments: ["owner", "admin", "agent"],
    users: ["owner", "admin"], organizations: ["owner", "admin"], suppliers: ["owner", "admin", "agent"], content: ["owner", "admin", "content"],
  };
  const resources=["requests","quotes","bookings","invoices","receipts","support","leads","approvals","assignments","notifications","audit","users","organizations","suppliers","content","reports"];
  for(const resource of resources)for(const action of ["create","update","delete"]){
    for(const role of roles)assert.equal(canAccessResource(role,resource,action),Boolean(mutable[resource]?.includes(role)),`${role} -> ${action} ${resource}`);
  }
  for(const role of roles){
    assert.equal(canAccessResource(role,"quotes","decide"),["owner","admin","agent","traveler","corporate_approver"].includes(role));
    assert.equal(canAccessResource(role,"approvals","decide"),["owner","admin","agent","corporate_approver"].includes(role));
  }
});

test("tenant overrides and report scopes are capability-specific", () => {
  for (const role of roles) assert.equal(canOverrideTenant(role), ["owner", "admin", "agent"].includes(role));
  assert.equal(reportScopeForRole("owner"), "full");
  assert.equal(reportScopeForRole("agent"), "travel");
  assert.equal(reportScopeForRole("finance"), "finance");
  assert.equal(reportScopeForRole("content"), "none");
  assert.equal(reportScopeForRole("corporate_approver"), "tenant");
});

test("service signatures accept rotated keys and reject stale or tampered requests", async () => {
  const current = { id: "current-service", secret: "c".repeat(32) };
  const previous = { id: "previous-service", secret: "p".repeat(32) };
  const url = "https://operations.example/v2/public/rate-limit?region=ke";
  const body = JSON.stringify({ scope: "magic-link", keyHash: await sha256Hex("identity") });
  const headers = await createServiceHeaders("POST", url, body, previous, 1_800_000);
  const request = () => new Request(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });
  assert.deepEqual(await verifyServiceRequest(request(), [current, previous], { now: 1_800_000 }), { ok: true, keyId: previous.id });
  const tampered = new Request(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: `${body} ` });
  assert.equal((await verifyServiceRequest(tampered, [current, previous], { now: 1_800_000 })).reason, "body_hash");
  assert.equal((await verifyServiceRequest(request(), [current, previous], { now: 2_200_000 })).reason, "stale");
  assert.equal((await verifyServiceRequest(request(), [{ id: "weak", secret: "short" }], { now: 1_800_000 })).reason, "configuration");
  assert.match(await sha256Hex("identity"), /^[a-f0-9]{64}$/u);
});

test("bounded JSON parsing enforces actual bytes without trusting Content-Length", async () => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify({ value: "x".repeat(500) }))); controller.close(); } });
  const request = new Request("https://site.example/api", { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": "10" }, body: stream, duplex: "half" });
  await assert.rejects(() => parseJson(request, { parse: (value) => value }, 100), (error) => error.status === 413);
});

test("strict public and financial schemas reject unknown fields and unsafe values", () => {
  const trip = {
    kind: "personal", contactName: "Test User", contactEmail: "test@example.com", origin: "Nairobi", destination: "Mombasa",
    departureDate: "2099-01-01", returnDate: "2099-01-02", travelerCount: 1, budgetMinor: 1000, currency: "KES", consent: true,
    unexpected: "nope",
  };
  assert.equal(tripRequestSchema.safeParse(trip).success, false);
  assert.equal(paymentSchema.safeParse({ amountMinor: 100, currency: "KES", method: "card", reference: "" }).success, false);
  assert.equal(contentSchema.safeParse({ kind: "article", slug: "test", title: "Test", summary: "Summary", description: "Description", imagePath: "https://evil.example/x.png" }).success, false);
});

test("browser and upload hardening remains wired into source boundaries", async () => {
  const [chat, proxy, storage, operationsLists, loadTest] = await Promise.all([
    readFile(new URL("../app/components/TawkLiveChat.tsx", import.meta.url), "utf8"),
    readFile(new URL("../proxy.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/storage.ts", import.meta.url), "utf8"),
    readFile(new URL("../workers/operations/src/lists.ts", import.meta.url), "utf8"),
    readFile(new URL("./load/tvse-1500.k6.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(chat, /6a7c3e52|TAWK_EMBED_URL/u);
  assert.match(chat, /loadRequested/u);
  for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "nonce-"]) assert.match(proxy, new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.doesNotMatch(storage, /wordprocessingml|DOCX/u);
  assert.match(operationsLists, /canAccessResource\(context\.actor\.role/u);
  assert.doesNotMatch(loadTest,/api\/auth\/access-token/u);
  await assert.rejects(()=>readFile(new URL("../app/api/auth/access-token/route.ts",import.meta.url),"utf8"),/ENOENT/u);
});
