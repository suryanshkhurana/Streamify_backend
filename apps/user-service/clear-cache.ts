import Redis from 'ioredis';
const redis = new Redis('redis://localhost:36379');
async function main() {
  const keys = await redis.keys('profile:*');
  if (keys.length > 0) {
    await redis.del(...keys);
    console.log('Cleared redis cache for profiles:', keys);
  } else {
    console.log('No profile cache found');
  }
  process.exit(0);
}
main();
