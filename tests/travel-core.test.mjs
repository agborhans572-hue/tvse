import assert from "node:assert/strict";
import test from "node:test";
import { assertTransition, calculateInvoiceBalance, calculateLineTotal, can, canTransition, formatMoney } from "../lib/travel.ts";
import { randomToken, sha256 } from "../lib/security.ts";

test("money stays in safe integer minor units", () => {
  assert.equal(calculateLineTotal(3, 12_500, 2_000, 1_600), 41_100);
  assert.deepEqual(calculateInvoiceBalance(100_000, [25_000, 30_000]), { paidMinor: 55_000, dueMinor: 45_000, status: "partially_paid" });
  assert.deepEqual(calculateInvoiceBalance(100_000, [100_000]), { paidMinor: 100_000, dueMinor: 0, status: "paid" });
  assert.throws(() => calculateInvoiceBalance(10_000, [10_001]), /cannot exceed/i);
  assert.match(formatMoney(125_050, "KES"), /1,251/);
  assert.match(formatMoney(125_050, "USD"), /1,250\.50/);
});

test("workflow state machines allow only explicit transitions", () => {
  assert.equal(canTransition("tripRequest", "submitted", "qualified"), true);
  assert.equal(canTransition("tripRequest", "submitted", "converted"), false);
  assert.equal(canTransition("quote", "draft", "sent"), true);
  assert.equal(canTransition("booking", "confirmed", "completed"), false);
  assert.equal(canTransition("invoice", "partially_paid", "paid"), true);
  assert.doesNotThrow(() => assertTransition("booking", "pending", "confirmed"));
  assert.throws(() => assertTransition("booking", "pending", "completed"), /invalid booking transition/i);
});

test("server permissions isolate finance, content and travel operations", () => {
  assert.equal(can("owner", "manage_users"), true);
  assert.equal(can("agent", "manage_travel"), true);
  assert.equal(can("agent", "manage_finance"), false);
  assert.equal(can("finance", "manage_finance"), true);
  assert.equal(can("content", "manage_content"), true);
  assert.equal(can("traveler", "manage_travel"), false);
});

test("authentication tokens have full entropy and are hashed at rest", async () => {
  const first = randomToken(32); const second = randomToken(32);
  assert.notEqual(first, second);
  assert.ok(first.length >= 43);
  const hash = await sha256(first);
  assert.match(hash, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(hash, first);
});
