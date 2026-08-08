import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
  const uri = process.env['MONGODB_URI'];
  if (!uri) throw new Error('MONGODB_URI is not set in .env');

  await mongoose.connect(uri);
  const Profile = mongoose.connection.collection('profiles');
  const users = await Profile.find({}).toArray();
  console.log('--- Profiles in DB ---');
  for (const u of users) {
    console.log(`AuthID: ${u.authId}`);
    console.log(`Name: ${u.displayName}`);
    console.log(`AvatarUrl: ${u.avatarUrl}`);
    console.log('-------------------');
  }
  process.exit(0);
}
main();
