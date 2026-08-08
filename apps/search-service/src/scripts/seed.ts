import { esClient, initElasticsearch } from '../config/elasticsearch.js';

async function seed() {
  console.log('Initializing Elasticsearch indices...');
  await initElasticsearch();

  console.log('Seeding mock artists...');
  await esClient.index({
    index: 'artists',
    id: 'artist_1',
    body: { id: 'artist_1', name: 'Daft Punk', avatarUrl: 'https://example.com/daft.jpg' }
  });
  await esClient.index({
    index: 'artists',
    id: 'artist_2',
    body: { id: 'artist_2', name: 'The Weeknd', avatarUrl: 'https://example.com/weeknd.jpg' }
  });

  console.log('Seeding mock albums...');
  await esClient.index({
    index: 'albums',
    id: 'album_1',
    body: { id: 'album_1', title: 'Discovery', artistName: 'Daft Punk', coverUrl: 'https://example.com/discovery.jpg' }
  });
  await esClient.index({
    index: 'albums',
    id: 'album_2',
    body: { id: 'album_2', title: 'Starboy', artistName: 'The Weeknd', coverUrl: 'https://example.com/starboy.jpg' }
  });

  console.log('Seeding mock tracks...');
  await esClient.index({
    index: 'tracks',
    id: 'track_1',
    body: { id: 'track_1', title: 'One More Time', artistName: 'Daft Punk', albumTitle: 'Discovery', coverUrl: 'https://example.com/discovery.jpg', durationMs: 320000 }
  });
  await esClient.index({
    index: 'tracks',
    id: 'track_2',
    body: { id: 'track_2', title: 'Starboy', artistName: 'The Weeknd', albumTitle: 'Starboy', coverUrl: 'https://example.com/starboy.jpg', durationMs: 230000 }
  });
  await esClient.index({
    index: 'tracks',
    id: 'track_3',
    body: { id: 'track_3', title: 'Blinding Lights', artistName: 'The Weeknd', albumTitle: 'After Hours', coverUrl: 'https://example.com/afterhours.jpg', durationMs: 200000 }
  });

  console.log('Refreshing indices...');
  await esClient.indices.refresh({ index: 'tracks,albums,artists' });
  
  console.log('Done!');
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
