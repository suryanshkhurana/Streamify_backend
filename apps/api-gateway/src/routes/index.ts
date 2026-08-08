/**
 * Route definitions for the API Gateway.
 *
 * Each entry maps an Express path prefix to:
 *   - target port (resolved from env vars)
 *   - auth mode:
 *       'public'   → no JWT required (but optionalAuthenticate still runs)
 *       'optional' → JWT is decoded if present, never rejects
 *       'required' → JWT must be valid, 401 otherwise
 */

export type AuthMode = 'public' | 'optional' | 'required';

export interface RouteConfig {
  prefix: string;       // Express path prefix, e.g. '/auth'
  port: number;         // Upstream service port
  service: string;      // Human-readable name for logs / error messages
  auth: AuthMode;
  urlEnv: string;       // Environment variable containing the full URL
}

function port(envVar: string, fallback: number): number {
  const raw = process.env[envVar];
  return raw ? parseInt(raw, 10) : fallback;
}

/**
 * Ordered list of gateway routes.
 * Express matches routes in order — more specific prefixes should come first.
 */
export const ROUTES: RouteConfig[] = [
  // ── Auth service ──────────────────────────────────────────────────────────
  // Completely public — auth-service handles its own access control
  {
    prefix: '/auth',
    port: port('AUTH_SERVICE_PORT', 3001),
    service: 'auth-service',
    auth: 'public',
    urlEnv: 'AUTH_SERVICE_URL',
  },

  // ── User service ──────────────────────────────────────────────────────────
  // Profile and preferences require a logged-in user
  {
    prefix: '/users',
    port: port('USER_SERVICE_PORT', 3002),
    service: 'user-service',
    auth: 'required',
    urlEnv: 'USER_SERVICE_URL',
  },

  // ── Catalog service ───────────────────────────────────────────────────────
  // Browsing is public; personalisation features read req.userId if present
  {
    prefix: '/catalog',
    port: port('CATALOG_SERVICE_PORT', 3003),
    service: 'catalog-service',
    auth: 'optional',
    urlEnv: 'CATALOG_SERVICE_URL',
  },

  // ── Stream service ────────────────────────────────────────────────────────
  // Streaming requires authentication (licensing / quota enforcement)
  {
    prefix: '/stream',
    port: port('STREAM_SERVICE_PORT', 3004),
    service: 'stream-service',
    auth: 'required',
    urlEnv: 'STREAM_SERVICE_URL',
  },

  // ── Search service ────────────────────────────────────────────────────────
  // Search is public; login enables personalised results
  {
    prefix: '/search',
    port: port('SEARCH_SERVICE_PORT', 3005),
    service: 'search-service',
    auth: 'optional',
    urlEnv: 'SEARCH_SERVICE_URL',
  },

  // ── Playlist service ──────────────────────────────────────────────────────
  // All playlist operations require a logged-in user
  {
    prefix: '/playlists',
    port: port('PLAYLIST_SERVICE_PORT', 3006),
    service: 'playlist-service',
    auth: 'required',
    urlEnv: 'PLAYLIST_SERVICE_URL',
  },
  {
    prefix: '/likes',
    port: port('PLAYLIST_SERVICE_PORT', 3006),
    service: 'playlist-service',
    auth: 'required',
    urlEnv: 'PLAYLIST_SERVICE_URL',
  },

  // ── Recommendation service ────────────────────────────────────────────────
  // Personalised — always requires authentication
  {
    prefix: '/recommendations',
    port: port('RECOMMENDATION_SERVICE_PORT', 3007),
    service: 'recommendation-service',
    auth: 'required',
    urlEnv: 'RECOMMENDATION_SERVICE_URL',
  },
];
