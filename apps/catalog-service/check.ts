import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const albums = await prisma.album.findMany();
  console.log('Albums:', albums);
}
main().catch(console.error).finally(() => prisma.$disconnect());
