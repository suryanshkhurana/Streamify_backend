import { Client } from '@elastic/elasticsearch';
import { logger } from '@streamify/shared-middleware';

export const esClient = new Client({
  node: process.env['ELASTICSEARCH_URL'] ?? 'http://localhost:9200',
});

const TRACKS_INDEX = 'tracks';
const ALBUMS_INDEX = 'albums';
const ARTISTS_INDEX = 'artists';

/**
 * Initializes the Elasticsearch indices and their mappings.
 * Uses an edge_ngram tokenizer for efficient prefix matching in typeahead.
 */
export async function initElasticsearch(): Promise<void> {
  try {
    const ping = await esClient.ping();
    if (!ping) throw new Error('Elasticsearch ping failed');
    logger.info('[elasticsearch] connected successfully');

    // Reusable settings for typeahead search
    const indexSettings = {
      analysis: {
        analyzer: {
          autocomplete: {
            type: 'custom',
            tokenizer: 'autocomplete_tokenizer',
            filter: ['lowercase'],
          },
          autocomplete_search: {
            type: 'custom',
            tokenizer: 'lowercase',
          },
        },
        tokenizer: {
          autocomplete_tokenizer: {
            type: 'edge_ngram',
            min_gram: 1,
            max_gram: 20,
            token_chars: ['letter', 'digit'],
          },
        },
      },
    };

    // 1. Tracks Index
    const tracksExist = await esClient.indices.exists({ index: TRACKS_INDEX });
    if (!tracksExist) {
      await esClient.indices.create({
        index: TRACKS_INDEX,
        body: {
          settings: indexSettings as any,
          mappings: {
            properties: {
              id: { type: 'keyword' },
              title: {
                type: 'text',
                analyzer: 'autocomplete',
                search_analyzer: 'autocomplete_search',
              },
              artistId:   { type: 'keyword' },
              artistName: {
                type: 'text',
                analyzer: 'autocomplete',
                search_analyzer: 'autocomplete_search',
              },
              albumTitle: { type: 'text' },
              coverUrl: { type: 'keyword' },
              durationMs: { type: 'integer' },
            },
          },
        },
      });
      logger.info(`[elasticsearch] Created index: ${TRACKS_INDEX}`);
    }

    // 2. Albums Index
    const albumsExist = await esClient.indices.exists({ index: ALBUMS_INDEX });
    if (!albumsExist) {
      await esClient.indices.create({
        index: ALBUMS_INDEX,
        body: {
          settings: indexSettings as any,
          mappings: {
            properties: {
              id: { type: 'keyword' },
              title: {
                type: 'text',
                analyzer: 'autocomplete',
                search_analyzer: 'autocomplete_search',
              },
              artistName: {
                type: 'text',
                analyzer: 'autocomplete',
                search_analyzer: 'autocomplete_search',
              },
              coverUrl: { type: 'keyword' },
            },
          },
        },
      });
      logger.info(`[elasticsearch] Created index: ${ALBUMS_INDEX}`);
    }

    // 3. Artists Index
    const artistsExist = await esClient.indices.exists({ index: ARTISTS_INDEX });
    if (!artistsExist) {
      await esClient.indices.create({
        index: ARTISTS_INDEX,
        body: {
          settings: indexSettings as any,
          mappings: {
            properties: {
              id:        { type: 'keyword' },
              name: {
                type: 'text',
                analyzer: 'autocomplete',
                search_analyzer: 'autocomplete_search',
              },
              bio:       { type: 'text' },
              avatarUrl: { type: 'keyword' },
            },
          },
        },
      });
      logger.info(`[elasticsearch] Created index: ${ARTISTS_INDEX}`);
    }
  } catch (err) {
    logger.error({ err }, '[elasticsearch] Failed to initialize');
  }
}
