/**
 * sync-api.ts
 *
 * One-shot script: pulls all READY tracks, artists, and albums from the
 * catalog-service and bulk-indexes them into Elasticsearch.
 *
 * Run: npx tsx src/scripts/sync-api.ts
 */

import { esClient, initElasticsearch } from '../config/elasticsearch.js';

const GW      = process.env['API_GATEWAY_URL'] ?? 'http://localhost:3000';

async function fetchAll(url: string): Promise<any[]> {
  const results: any[] = [];
  let page = 1;
  while (true) {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(`${url}${sep}page=${page}&limit=100`);
    const body = await res.json() as any;
    const items =
      body.tracks ?? body.data?.tracks ??
      body.artists ?? body.data?.artists ?? body.data ??
      body.albums ?? body.data?.albums ??
      [];
    if (!items.length) break;
    results.push(...items);
    if (items.length < 100) break;
    page++;
  }
  return results;
}

async function sync() {
  console.log('[sync] Initializing Elasticsearch…');
  await initElasticsearch();

  // ── Tracks ──
  console.log('[sync] Fetching tracks from catalog-service…');
  const tracks = await fetchAll(`${GW}/catalog/tracks?status=READY`).catch(() => []);
  console.log(`[sync] Found ${tracks.length} READY tracks`);

  for (const t of tracks) {
    await esClient.index({
      index: 'tracks',
      id: t.id,
      body: {
        id:          t.id,
        title:       t.title,
        artistId:    t.artist?.id  ?? t.artistId  ?? '',
        artistName:  t.artist?.name ?? t.artistName ?? 'Unknown Artist',
        albumTitle:  t.album?.title ?? t.albumTitle ?? '',
        coverUrl:    t.album?.coverUrl ?? t.coverUrl ?? '',
        durationMs:  t.durationMs ?? 0,
      },
    });
    console.log(`  ✓ track: ${t.title}`);
  }

  // ── Artists ──
  console.log('[sync] Fetching artists from catalog-service…');
  const artists = await fetchAll(`${GW}/catalog/artists`).catch(() => []);
  console.log(`[sync] Found ${artists.length} artists`);

  for (const a of artists) {
    await esClient.index({
      index: 'artists',
      id: a.id,
      body: {
        id:        a.id,
        name:      a.name,
        bio:       a.bio ?? '',
        avatarUrl: a.avatarUrl ?? '',
      },
    });
    console.log(`  ✓ artist: ${a.name}`);
  }

  // ── Albums ──
  console.log('[sync] Fetching albums from catalog-service…');
  const albums = await fetchAll(`${GW}/catalog/albums`).catch(() => []);
  console.log(`[sync] Found ${albums.length} albums`);

  for (const a of albums) {
    await esClient.index({
      index: 'albums',
      id: a.id,
      body: {
        id:         a.id,
        title:      a.title,
        artistId:   a.artist?.id   ?? '',
        artistName: a.artist?.name ?? 'Unknown Artist',
        coverUrl:   a.coverUrl ?? '',
      },
    });
    console.log(`  ✓ album: ${a.title}`);
  }

  // Refresh so results are immediately available
  console.log('[sync] Refreshing indices…');
  await esClient.indices.refresh({ index: 'tracks,albums,artists' });
  console.log('[sync] Done!');
  process.exit(0);
}

sync().catch(err => {
  console.error('[sync] Error:', err);
  process.exit(1);
});
