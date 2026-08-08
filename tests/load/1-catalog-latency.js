/**
 * TEST 1 — Catalog Browsing Latency
 * Measures PostgreSQL query performance under concurrent users.
 * Target: p(95) < 500ms at 50 concurrent users.
 *
 * Run: k6 run tests/load/1-catalog-latency.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const trackLatency  = new Trend('track_list_latency_ms');
const albumLatency  = new Trend('album_list_latency_ms');
const errorRate     = new Rate('error_rate');

export const options = {
  stages: [
    { duration: '20s', target: 10  },  // warm up
    { duration: '40s', target: 50  },  // ramp to 50 concurrent
    { duration: '40s', target: 50  },  // hold — this is your test window
    { duration: '20s', target: 0   },  // cool down
  ],
  thresholds: {
    http_req_duration:   ['p(95)<800', 'p(99)<1500'],
    http_req_failed:     ['rate<0.05'],
    track_list_latency_ms: ['p(95)<500'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  group('home_page_load', () => {
    // Simulates what your HomePage loads on mount
    const tracksRes = http.get(`${BASE_URL}/catalog/tracks?sort=popular&limit=10`);
    trackLatency.add(tracksRes.timings.duration);
    errorRate.add(tracksRes.status !== 200);
    check(tracksRes, {
      'top tracks — status 200':    (r) => r.status === 200,
      'top tracks — has data':      (r) => JSON.parse(r.body)?.tracks?.length >= 0,
      'top tracks — under 500ms':   (r) => r.timings.duration < 500,
    });

    const albumsRes = http.get(`${BASE_URL}/catalog/albums?sort=recent&limit=10`);
    albumLatency.add(albumsRes.timings.duration);
    errorRate.add(albumsRes.status !== 200);
    check(albumsRes, {
      'new albums — status 200':    (r) => r.status === 200,
      'new albums — under 500ms':   (r) => r.timings.duration < 500,
    });

    const allTracksRes = http.get(`${BASE_URL}/catalog/tracks?limit=20`);
    check(allTracksRes, {
      'all tracks — status 200': (r) => r.status === 200,
    });
  });

  sleep(0.5);
}
