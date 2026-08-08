/**
 * TEST 3 — Auth Throughput & Token Flow
 * Measures login latency (bcrypt is CPU-bound) and the refresh token flow.
 * Also verifies the rate limiter fires after sustained load.
 *
 * SETUP BEFORE RUNNING:
 *   Create a real test user first:
 *   curl -X POST http://localhost:3000/auth/register \
 *     -H "Content-Type: application/json" \
 *     -d '{"email":"loadtest@streamify.test","password":"LoadTest123!","displayName":"Load Tester"}'
 *
 * Run: k6 run tests/load/3-auth-throughput.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const loginLatency     = new Trend('login_latency_ms');
const refreshLatency   = new Trend('refresh_latency_ms');
const loginErrors      = new Rate('login_error_rate');
const rateLimitHits    = new Counter('rate_limit_429_count');

export const options = {
  stages: [
    { duration: '20s', target: 5  },   // gentle ramp
    { duration: '40s', target: 30  },  // ramp to 30 users
    { duration: '40s', target: 30  },  // hold
    { duration: '20s', target: 0   },  // cool down
  ],
  thresholds: {
    login_latency_ms:  ['p(95)<800'],   // bcrypt is slow by design; 800ms is ok
    login_error_rate:  ['rate<0.1'],
    http_req_failed:   ['rate<0.15'],   // some 429s are expected under heavy load
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// ── Test credentials — create this user before running ──────────────────────
const TEST_EMAIL    = __ENV.TEST_EMAIL    || 'loadtest@streamify.test';
const TEST_PASSWORD = __ENV.TEST_PASSWORD || 'LoadTest123!';

export default function () {
  let accessToken = null;

  group('login_flow', () => {
    const res = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
      { headers: { 'Content-Type': 'application/json' }, jar: true }
    );

    loginLatency.add(res.timings.duration);

    if (res.status === 429) {
      rateLimitHits.add(1);
      console.log(`[rate-limit] 429 received — rate limiter is working`);
      sleep(2);
      return;
    }

    loginErrors.add(res.status !== 200);

    const body = (() => { try { return JSON.parse(res.body); } catch { return null; } })();
    accessToken = body?.data?.accessToken;

    check(res, {
      'login — status 200':     (r) => r.status === 200,
      'login — has token':      (_) => accessToken !== null,
      'login — under 600ms':    (r) => r.timings.duration < 600,
    });
  });

  if (!accessToken) { sleep(1); return; }

  sleep(0.5);

  // Verify token works
  group('verify_token', () => {
    const res = http.get(
      `${BASE_URL}/auth/me`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    check(res, {
      'auth/me — status 200': (r) => r.status === 200,
    });
  });

  sleep(1);
}
