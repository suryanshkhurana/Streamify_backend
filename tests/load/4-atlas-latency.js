/**
 * TEST 4 — User & Playlist Services (MongoDB Atlas Latency)
 * Measures real Atlas network latency for user profile + playlist reads.
 * These numbers will be higher than local Postgres — that's expected and honest.
 *
 * SETUP BEFORE RUNNING:
 *   You need a valid JWT access token. Get one by running:
 *   curl -X POST http://localhost:3000/auth/login \
 *     -H "Content-Type: application/json" \
 *     -d '{"email":"loadtest@streamify.test","password":"LoadTest123!"}'
 *   Then set: k6 run --env ACCESS_TOKEN=<token_here> tests/load/4-atlas-latency.js
 *
 * Run: k6 run --env ACCESS_TOKEN=<your_token> tests/load/4-atlas-latency.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const profileLatency   = new Trend('profile_latency_ms');     // MongoDB Atlas
const playlistLatency  = new Trend('playlist_list_latency_ms'); // MongoDB Atlas
const historyLatency   = new Trend('history_latency_ms');      // MongoDB Atlas
const errorRate        = new Rate('error_rate');

export const options = {
  stages: [
    { duration: '15s', target: 5  },
    { duration: '30s', target: 20  },
    { duration: '45s', target: 20  },  // hold
    { duration: '10s', target: 0   },
  ],
  thresholds: {
    // Atlas adds network RTT — these thresholds account for that
    profile_latency_ms:      ['p(95)<600'],
    playlist_list_latency_ms: ['p(95)<600'],
    http_req_failed:         ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TOKEN    = __ENV.ACCESS_TOKEN;

export default function () {
  if (!TOKEN) {
    console.error('ACCESS_TOKEN env var is required. See file header for setup.');
    return;
  }

  const authHeaders = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
  };

  group('atlas_reads', () => {
    // User profile (MongoDB Atlas)
    group('user_profile', () => {
      const res = http.get(`${BASE_URL}/users/me`, authHeaders);
      profileLatency.add(res.timings.duration);
      errorRate.add(res.status !== 200);
      check(res, {
        'profile — status 200':   (r) => r.status === 200,
        'profile — has authId':   (r) => {
          try { return !!JSON.parse(r.body)?.data?.authId; }
          catch { return false; }
        },
      });
    });

    sleep(0.2);

    // My playlists (MongoDB Atlas)
    group('my_playlists', () => {
      const res = http.get(`${BASE_URL}/playlists`, authHeaders);
      playlistLatency.add(res.timings.duration);
      check(res, {
        'playlists — status 200': (r) => r.status === 200,
      });
    });

    sleep(0.2);

    // Liked songs (MongoDB Atlas)
    group('liked_songs', () => {
      const res = http.get(`${BASE_URL}/likes`, authHeaders);
      check(res, {
        'likes — status 200': (r) => r.status === 200,
      });
    });

    sleep(0.2);

    // Listening history (MongoDB Atlas)
    group('listening_history', () => {
      const res = http.get(`${BASE_URL}/users/me/history`, authHeaders);
      historyLatency.add(res.timings.duration);
      check(res, {
        'history — status 200': (r) => r.status === 200,
      });
    });
  });

  sleep(0.5);
}
