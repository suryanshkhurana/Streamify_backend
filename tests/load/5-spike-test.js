/**
 * TEST 5 — Concurrent User Spike (End-to-End)
 * Simulates a traffic spike: users browse catalog and search simultaneously.
 * Uses only PUBLIC endpoints (no token needed) — easiest test to run.
 * 
 * This gives you: "handled X concurrent users at p(95) < Xms"
 *
 * Run: k6 run tests/load/5-spike-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const p95Overall = new Trend('overall_latency_ms');
const errorRate  = new Rate('error_rate');

export const options = {
  // Two scenarios running at the same time
  scenarios: {
    // Steady background load (browsing users)
    steady_browsers: {
      executor: 'constant-vus',
      vus: 20,
      duration: '2m',
    },
    // Sudden spike (e.g. social media link goes viral)
    traffic_spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 80 },   // spike up fast
        { duration: '20s', target: 80 },   // hold spike
        { duration: '10s', target: 0  },   // drop
      ],
      startTime: '60s',  // spike hits at T=1min into the test
    },
  },
  thresholds: {
    overall_latency_ms: ['p(95)<1000', 'p(99)<3000'],
    error_rate:         ['rate<0.05'],
    http_req_failed:    ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const SEARCH_QUERIES = ['rock', 'pop', 'jazz', 'love', 'night', 'hip hop', 'dance'];

export default function () {
  const scenario = Math.random();

  if (scenario < 0.4) {
    // 40%: Browse home page
    group('browse_home', () => {
      const res = http.get(`${BASE_URL}/catalog/tracks?sort=popular&limit=10`);
      p95Overall.add(res.timings.duration);
      errorRate.add(res.status !== 200);
      check(res, { 'tracks 200': (r) => r.status === 200 });
      sleep(0.3);
      const a = http.get(`${BASE_URL}/catalog/albums?sort=recent&limit=10`);
      p95Overall.add(a.timings.duration);
      check(a, { 'albums 200': (r) => r.status === 200 });
    });

  } else if (scenario < 0.7) {
    // 30%: Search
    group('search', () => {
      const q = SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)];
      const res = http.get(`${BASE_URL}/search?q=${encodeURIComponent(q)}`);
      p95Overall.add(res.timings.duration);
      errorRate.add(res.status !== 200);
      check(res, { 'search 200': (r) => r.status === 200 });
      sleep(0.2);
      const suggest = http.get(`${BASE_URL}/search/suggest?q=${encodeURIComponent(q.slice(0, 3))}`);
      p95Overall.add(suggest.timings.duration);
    });

  } else {
    // 30%: Browse public playlists + catalog
    group('browse_catalog', () => {
      const res = http.get(`${BASE_URL}/catalog/tracks?limit=20`);
      p95Overall.add(res.timings.duration);
      errorRate.add(res.status !== 200);
      check(res, { 'catalog 200': (r) => r.status === 200 });
      sleep(0.2);
      const pub = http.get(`${BASE_URL}/catalog/albums?limit=20`);
      p95Overall.add(pub.timings.duration);
    });
  }

  sleep(0.5 + Math.random() * 0.5); // randomise think time
}
