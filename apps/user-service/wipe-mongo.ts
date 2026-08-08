import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function dropMongo(uri: string | undefined, name: string) {
  if (!uri) {
    console.log(`No URI for ${name}, skipping.`);
    return;
  }
  try {
    console.log(`Dropping MongoDB database: ${name}...`);
    const conn = await mongoose.createConnection(uri).asPromise();
    await conn.dropDatabase();
    await conn.close();
    console.log(`Successfully dropped ${name}.`);
  } catch (err) {
    console.error(`Failed to drop ${name}:`, err);
  }
}

async function wipeMongo() {
  console.log('--- Wiping MongoDB Databases ---');
  const baseUri = process.env.MONGODB_URI;
  if (!baseUri) {
    console.log('No MONGODB_URI found, skipping.');
    return;
  }
  
  // baseUri might be mongodb+srv://.../streamify-users
  // We can replace streamify-users with the other db names.
  const usersUri = baseUri;
  const playlistsUri = baseUri.replace('streamify-users', 'streamify-playlists');
  const recommendationsUri = baseUri.replace('streamify-users', 'streamify-recommendations');

  await dropMongo(usersUri, 'Users DB');
  await dropMongo(playlistsUri, 'Playlists DB');
  await dropMongo(recommendationsUri, 'Recommendations DB');
}

wipeMongo().then(() => process.exit(0));
