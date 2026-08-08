/**
 * search.controller.ts — enhanced with catalog-service fallback
 *
 * Strategy:
 *  1. Query Elasticsearch for fast fuzzy results (primary)
 *  2. If ES returns nothing (empty indices, not yet indexed), fall back to
 *     direct Postgres/catalog queries via internal HTTP so search always works.
 */

import type { Request, Response, RequestHandler } from 'express';
import { catchAsync } from '@streamify/shared-middleware';
import { esClient } from '../config/elasticsearch.js';
import { redis } from '../config/redis.js';

// Catalog-service base URL (internal Docker network or localhost in dev)
const CATALOG_URL = process.env['CATALOG_URL'] ?? 'http://localhost:3003';

// ─── Catalog fallback helpers ─────────────────────────────────────────────────

async function fallbackSearch(query: string) {
  // encode query for potential future URL usage
  // const q = encodeURIComponent(query);
  const limit = 20;

  const [tracksRes, artistsRes, albumsRes] = await Promise.allSettled([
    fetch(`${CATALOG_URL}/catalog/tracks?limit=${limit}`).then(r => r.json()),
    fetch(`${CATALOG_URL}/catalog/artists?limit=${limit}`).then(r => r.json()),
    fetch(`${CATALOG_URL}/catalog/albums?limit=${limit}`).then(r => r.json()),
  ]);

  const lq = query.toLowerCase();

  const matchesText = (text: string | null | undefined) =>
    !!text && text.toLowerCase().includes(lq);

  // Filter locally
  const allTracks  = (tracksRes.status  === 'fulfilled' ? (tracksRes.value as any)?.tracks  || [] : []) as any[];
  const allArtists = (artistsRes.status === 'fulfilled' ? (artistsRes.value as any)?.data    || [] : []) as any[];
  const allAlbums  = (albumsRes.status  === 'fulfilled' ? (albumsRes.value as any)?.albums   || (albumsRes.value as any)?.data?.albums || [] : []) as any[];

  const tracks = allTracks
    .filter((t: any) => t.status === 'READY' && (matchesText(t.title) || matchesText(t.artist?.name)))
    .slice(0, 10)
    .map((t: any) => ({
      id: t.id,
      title: t.title,
      artistId: t.artist?.id,
      artistName: t.artist?.name ?? '',
      albumTitle: t.album?.title ?? '',
      coverUrl: t.album?.coverUrl ?? t.coverUrl ?? '',
      durationMs: t.durationMs ?? 0,
    }));

  const artists = allArtists
    .filter((a: any) => matchesText(a.name))
    .slice(0, 6)
    .map((a: any) => ({
      id: a.id,
      name: a.name,
      avatarUrl: a.avatarUrl ?? '',
    }));

  const albums = allAlbums
    .filter((a: any) => matchesText(a.title) || matchesText(a.artist?.name))
    .slice(0, 6)
    .map((a: any) => ({
      id: a.id,
      title: a.title,
      artistId: a.artist?.id,
      artistName: a.artist?.name ?? '',
      coverUrl: a.coverUrl ?? '',
    }));

  return { tracks, artists, albums };
}

// ─── GET /search ─────────────────────────────────────────────────────────────

export const search: RequestHandler = catchAsync(async (req: Request, res: Response) => {
  const query = req.query.q as string;
  if (!query || !query.trim()) {
    res.json({ success: true, data: { tracks: [], albums: [], artists: [] } });
    return;
  }

  let tracks: any[] = [];
  let albums: any[] = [];
  let artists: any[] = [];
  let usedElasticsearch = false;

  try {
    // Multi-search across the three indices
    const { responses } = await esClient.msearch({
      body: [
        { index: 'tracks' },
        {
          size: 20,
          query: { multi_match: { query, fields: ['title^3', 'artistName^2', 'albumTitle'], fuzziness: 'AUTO' } },
        },
        { index: 'albums' },
        {
          size: 10,
          query: { multi_match: { query, fields: ['title^3', 'artistName^2'], fuzziness: 'AUTO' } },
        },
        { index: 'artists' },
        {
          size: 10,
          query: { multi_match: { query, fields: ['name^3', 'bio'], fuzziness: 'AUTO' } },
        },
      ],
    });

    const [tracksRes, albumsRes, artistsRes] = responses as any[];

    tracks  = tracksRes?.hits?.hits.map((h: any) => h._source)  ?? [];
    albums  = albumsRes?.hits?.hits.map((h: any) => h._source)  ?? [];
    artists = artistsRes?.hits?.hits.map((h: any) => h._source) ?? [];
    usedElasticsearch = true;
  } catch (_esErr) {
    // ES unreachable — fall through to catalog fallback
  }

  // If ES returned nothing, use catalog-service direct search as fallback
  if (!tracks.length && !albums.length && !artists.length) {
    const fallback = await fallbackSearch(query);
    tracks  = fallback.tracks;
    albums  = fallback.albums;
    artists = fallback.artists;
  }

  // Record trending search (fire-and-forget)
  if (query.length > 2) {
    redis.zincrby('search:trending', 1, query.toLowerCase()).catch(() => {});
  }

  res.json({
    success: true,
    data: { tracks, albums, artists },
    meta: { source: usedElasticsearch ? 'elasticsearch' : 'catalog-fallback' },
  });
});

// ─── GET /search/suggest ─────────────────────────────────────────────────────

export const suggest: RequestHandler = catchAsync(async (req: Request, res: Response) => {
  const query = req.query.q as string;
  if (!query || !query.trim()) {
    res.json({ success: true, data: { tracks: [], albums: [], artists: [] } });
    return;
  }

  let tracks: any[] = [];
  let albums: any[] = [];
  let artists: any[] = [];

  try {
    const { responses } = await esClient.msearch({
      body: [
        { index: 'tracks' },
        {
          size: 5,
          query: {
            multi_match: {
              query,
              fields: ['title^3', 'artistName^2'],
              fuzziness: 'AUTO',
            },
          },
        },
        { index: 'albums' },
        {
          size: 3,
          query: { match: { title: { query, fuzziness: 'AUTO' } } },
        },
        { index: 'artists' },
        {
          size: 3,
          query: { match: { name: { query, fuzziness: 'AUTO' } } },
        },
      ],
    });

    const [tracksRes, albumsRes, artistsRes] = responses as any[];
    tracks  = tracksRes?.hits?.hits.map((h: any) => h._source)  ?? [];
    albums  = albumsRes?.hits?.hits.map((h: any) => h._source)  ?? [];
    artists = artistsRes?.hits?.hits.map((h: any) => h._source) ?? [];
  } catch (_esErr) {
    // ES down — fallback to catalog
  }

  // Fallback: if ES returned nothing, use catalog directly
  if (!tracks.length && !albums.length && !artists.length) {
    const fallback = await fallbackSearch(query);
    tracks  = fallback.tracks.slice(0, 5);
    albums  = fallback.albums.slice(0, 3);
    artists = fallback.artists.slice(0, 3);
  }

  res.json({ success: true, data: { tracks, albums, artists } });
});

// ─── GET /search/trending ────────────────────────────────────────────────────

export const trending: RequestHandler = catchAsync(async (_req: Request, res: Response) => {
  const topQueries = await redis.zrevrange('search:trending', 0, 9);
  res.json({ success: true, data: topQueries });
});
