// =============================================================================
//  k6 load / stress test — simulates concurrent users hitting the CMS auth API
//  and a read endpoint. Validates latency thresholds and error rate under load.
//
//  Run:   k6 run perf/k6/load-test.js
//  Env:   CMS_BASE_URL, CMS_ADMIN_EMAIL, CMS_ADMIN_PASSWORD
//
//  NOTE: Adjust the login endpoint/payload to match the CMS auth API once the
//  exact contract is confirmed (network tab → request to the auth endpoint).
// =============================================================================

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.CMS_BASE_URL || 'https://cms.wilyersignage.com';

const errorRate = new Rate('errors');
const loginLatency = new Trend('login_latency_ms', true);

export const options = {
  scenarios: {
    // Ramp to 20 concurrent users, hold, ramp down.
    ramping_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '1m', target: 20 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'], // 95% of requests under 3s
    errors: ['rate<0.05'], // < 5% errors
    login_latency_ms: ['p(95)<3500'],
  },
};

export default function () {
  // 1. Load the app shell (CDN/static + initial API).
  const home = http.get(`${BASE_URL}/`);
  check(home, { 'home 2xx/3xx': (r) => r.status < 400 });
  errorRate.add(home.status >= 400);

  // 2. Exercise the auth endpoint under load (adjust path/payload to real API).
  const payload = JSON.stringify({
    email: __ENV.CMS_ADMIN_EMAIL || '',
    password: __ENV.CMS_ADMIN_PASSWORD || '',
  });
  const res = http.post(`${BASE_URL}/api/login`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  loginLatency.add(res.timings.duration);
  check(res, { 'login responded': (r) => r.status !== 0 });

  sleep(1);
}
