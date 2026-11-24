import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedDatabase } from './seed-data.js';

// Punkt wejścia polecenia "npx prisma db seed". Dane i logika są w seed-data.ts, aby testy mogły z nich korzystać. (DamianTchorzewski_72206)
const connectionString = process.env['DATABASE_URL'];

if (!connectionString) {
  throw new Error('DATABASE_URL is not set.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

try {
  if (
    process.env['SEED_ONLY_IF_EMPTY'] === 'true' &&
    (await prisma.roomType.count()) > 0
  ) {
    console.log('The database already has data, nothing to seed.');
  } else {
    const summary = await seedDatabase(prisma);
    console.log(
      `Seeded ${summary.roomTypes} room types, ${summary.rooms} rooms and ${summary.reservations} test reservations.`,
    );
  }
} finally {
  await prisma.$disconnect();
}
