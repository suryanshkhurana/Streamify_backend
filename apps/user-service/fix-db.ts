import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
  const uri = process.env['MONGODB_URI'];
  if (!uri) throw new Error('MONGODB_URI is not set in .env');

  await mongoose.connect(uri);
  const Profile = mongoose.connection.collection('profiles');

  const docs = await Profile.find({}).toArray();
  for (const d of docs) {
    if (d.avatarUrl && d.avatarUrl.includes('streamify-music-storage.s3.ap-south-1.amazonaws.com')) {
      const newUrl = d.avatarUrl.replace('https://streamify-music-storage.s3.ap-south-1.amazonaws.com', 'https://dpso6xwfx1woz.cloudfront.net');
      await Profile.updateOne({ _id: d._id }, { $set: { avatarUrl: newUrl } });
      console.log('Updated:', newUrl);
    }
  }
  process.exit(0);
}
main();
