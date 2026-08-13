import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const errors = new Rate("tvse_errors");
const reads = new Trend("tvse_read_duration", true);
const writes = new Trend("tvse_write_ack_duration", true);

export const options = {
  scenarios: {
    sustained: { executor: "constant-arrival-rate", rate: 100, timeUnit: "1s", duration: "30m", preAllocatedVUs: 300, maxVUs: 1500 },
    burst: { executor: "constant-arrival-rate", rate: 250, timeUnit: "1s", duration: "2m", startTime: "30m15s", preAllocatedVUs: 500, maxVUs: 1500 },
    soak: { executor: "constant-arrival-rate", rate: 50, timeUnit: "1s", duration: "2h", startTime: "32m30s", preAllocatedVUs: 150, maxVUs: 1500 },
  },
  thresholds: {
    tvse_errors: ["rate<0.005"],
    tvse_read_duration: ["p(95)<500", "p(99)<1500"],
    tvse_write_ack_duration: ["p(95)<1000"],
    http_req_failed: ["rate<0.005"],
  },
};

const operationsUrl = __ENV.OPERATIONS_API_URL;
const sitesOrigin = __ENV.SITES_ORIGIN;
const staticToken = __ENV.TVSE_ACCESS_TOKEN;
const readRoutes = ["overview", "requests", "quotes", "bookings", "invoices", "support", "reports", "notifications", "audit"];

export function setup() {
  if (!operationsUrl || !sitesOrigin) throw new Error("OPERATIONS_API_URL and SITES_ORIGIN are required");
  if (!staticToken) throw new Error("Provide a short-lived, server-generated TVSE_ACCESS_TOKEN. Browser token issuance has been removed.");
}

export default function tvseLoadScenario() {
  const write = Math.random() < 0.10;
  let response;
  if (write) {
    response = http.post(`${operationsUrl}/v2/requests`, JSON.stringify({
      kind: "personal",
      contactName: `Load User ${__VU}`,
      contactEmail: `load-${__VU}@example.test`,
      origin: "Nairobi",
      destination: "Mombasa",
      departureDate: "2099-01-10",
      returnDate: "2099-01-14",
      travelerCount: 1,
      budgetMinor: 10_000_000,
      currency: "KES",
      interests: [],
      notes: "load test",
    }), { headers: operationHeaders(staticToken, { "Idempotency-Key": `${__VU}-${__ITER}-${Date.now()}` }) });
    writes.add(response.timings.duration);
  } else {
    const route = readRoutes[Math.floor(Math.random() * readRoutes.length)];
    response = http.get(`${operationsUrl}/v2/${route}?limit=25`, { headers: operationHeaders(staticToken) });
    reads.add(response.timings.duration);
  }
  const ok = check(response, {
    "accepted": (result) => result.status < 500,
    "no overload": (result) => !String(result.body).toLowerCase().includes("overloaded"),
    "tenant boundary intact": (result) => !String(result.body).includes("CROSS_TENANT"),
  });
  errors.add(!ok || response.status >= 500);
  sleep(Math.random() * 0.2);
}

function operationHeaders(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, Origin: sitesOrigin, "Content-Type": "application/json", ...extra };
}
