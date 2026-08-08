const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tracks = await prisma.track.findMany({
    where: { status: 'READY' }
  });
  console.dir(tracks, { depth: null });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
