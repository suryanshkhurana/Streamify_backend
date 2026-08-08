/**
 * TEST 2 — Search Service Latency (Elasticsearch + Redis)
 * Measures ES full-text search latency vs Redis-cached suggestions.
 * This will show you the speed difference between the two paths.
 *
 * Run: k6 run tests/load/2-search-latency.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const fullSearchLatency  = new Trend('full_search_latency_ms');
const suggestLatency     = new Trend('suggest_latency_ms');
const trendingLatency    = new Trend('trending_latency_ms');
const errorRate          = new Rate('error_rate');

export const options = {
  stages: [
    { duration: '15s', target: 5  },   // warm up Elasticsearch JVM
    { duration: '30s', target: 25  },  // ramp
    { duration: '45s', target: 25  },  // hold — test window
    { duration: '10s', target: 0   },  // cool down
  ],
  thresholds: {
    full_search_latency_ms: ['p(95)<1500'],  // ES can be slow cold
    suggest_latency_ms:     ['p(95)<300'],   // Redis cache should be fast
    http_req_failed:        ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Mix of different length queries to simulate real user behaviour
const QUERIES = [
  'pop', 'rock', 'jazz', 'lo', 'love', 'night', 'summer',
  'hip', 'chill', 'dance', 'ba', 'ar', 'classical', 'indie',
];

export default function () {
  const q = QUERIES[Math.floor(Math.random() * QUERIES.length)];

  group('search_flow', () => {
    // Full text search (hits Elasticsearch)
    group('full_search', () => {
      const res = http.get(`${BASE_URL}/search?q=${encodeURIComponent(q)}`);
      fullSearchLatency.add(res.timings.duration);
      errorRate.add(res.status !== 200);
      check(res, {
        'search — status 200':       (r) => r.status === 200,
        'search — has tracks array': (r) => {
          try { return Array.isArray(JSON.parse(r.body)?.data?.tracks); }
          catch { return false; }
        },
      });
    });

    sleep(0.1);

    // Typeahead suggest (first chars → Redis cached after first hit)
    group('typeahead_suggest', () => {
      const shortQ = q.slice(0, Math.min(3, q.length));
      const res = http.get(`${BASE_URL}/search/suggest?q=${encodeURIComponent(shortQ)}`);
      suggestLatency.add(res.timings.duration);
      check(res, {
        'suggest — status 200': (r) => r.status === 200,
      });
    });

    sleep(0.1);

    // Trending (reads Redis sorted set)
    group('trending', () => {
      const res = http.get(`${BASE_URL}/search/trending`);
      trendingLatency.add(res.timings.duration);
      check(res, {
        'trending — status 200': (r) => r.status === 200,
      });
    });
  });

  sleep(0.5);
}
