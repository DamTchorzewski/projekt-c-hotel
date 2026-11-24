import {
  addDays,
  nightsBetween,
  parseDateOnly,
  todayInHotel,
} from '../src/common/dates/date-utils.js';
import { calculateTotalPrice } from '../src/common/pricing/stay-pricing.js';
import type { Prisma, PrismaClient } from '../src/generated/prisma/client.js';

export interface SeedSummary {
  roomTypes: number;
  rooms: number;
  reservations: number;
}

const picture = (code: string): string =>
  `https://picsum.photos/seed/hotel-c-${code.toLowerCase()}/800/600`;

// Dane startowe z dokumentacji 0.3, rozdział "Dane startowe i testowe (seed)". (DamianTchorzewski_72206)
export const ROOM_TYPES = [
  {
    code: 'SGL',
    name: 'Pokój jednoosobowy',
    maxCapacity: 1,
    basePricePerNight: 180,
    amenities: ['TV', 'Wi-Fi'],
    description: 'Cichy pokój dla jednej osoby z wygodnym łóżkiem i biurkiem.',
    imageUrl: picture('SGL'),
  },
  {
    code: 'DBL',
    name: 'Pokój dwuosobowy',
    maxCapacity: 2,
    basePricePerNight: 250,
    amenities: ['TV', 'Wi-Fi', 'balkon'],
    description: 'Pokój z łóżkiem małżeńskim i balkonem.',
    imageUrl: picture('DBL'),
  },
  {
    code: 'TWN',
    name: 'Pokój z dwoma łóżkami',
    maxCapacity: 2,
    basePricePerNight: 260,
    amenities: ['TV', 'Wi-Fi', 'czajnik'],
    description: 'Pokój z dwoma osobnymi łóżkami.',
    imageUrl: picture('TWN'),
  },
  {
    code: 'SUITE',
    name: 'Apartament',
    maxCapacity: 4,
    basePricePerNight: 450,
    amenities: ['TV', 'Wi-Fi', 'aneks', 'wanna'],
    description: 'Apartament z aneksem kuchennym i wanną dla czterech osób.',
    imageUrl: picture('SUITE'),
  },
];

export const ROOMS = [
  { roomNumber: '101', typeCode: 'SGL', isActive: true },
  { roomNumber: '102', typeCode: 'DBL', isActive: true },
  { roomNumber: '103', typeCode: 'DBL', isActive: true },
  { roomNumber: '201', typeCode: 'TWN', isActive: true },
  { roomNumber: '202', typeCode: 'SUITE', isActive: true },
  // Pokój w remoncie: wyszukiwarka nigdy go nie pokazuje (RB-05). (DamianTchorzewski_72206)
  { roomNumber: '203', typeCode: 'DBL', isActive: false },
];

const ANNA = {
  firstName: 'Anna',
  lastName: 'Kowalska',
  email: 'anna.kowalska@example.com',
  phone: '+48500100200',
};
const JAN = {
  firstName: 'Jan',
  lastName: 'Nowak',
  email: 'jan.nowak@example.com',
  phone: '+48500100300',
};
const EWA = {
  firstName: 'Ewa',
  lastName: 'Wiśniewska',
  email: 'ewa.wisniewska@example.com',
  phone: '+48500100400',
};

// Daty są liczone względem dnia uruchomienia skryptu (D0), więc dane testowe są zawsze aktualne. (DamianTchorzewski_72206)
export const RESERVATIONS = [
  {
    number: 'R-000001',
    roomNumber: '102',
    guest: ANNA,
    from: 0,
    to: 3,
    guestsCount: 2,
    status: 'CONFIRMED',
    source: 'RECEPTION',
    voucherCode: null,
    voucherStatus: 'NONE',
    services: [],
  },
  {
    number: 'R-000002',
    roomNumber: '201',
    guest: JAN,
    from: 0,
    to: 2,
    guestsCount: 2,
    status: 'CONFIRMED',
    source: 'PARTNER_D',
    voucherCode: 'TEST-C-0001',
    voucherStatus: 'PENDING_VERIFICATION',
    services: [
      {
        partnerType: 'MASSAGE_A',
        partnerServiceId: 'A-MASSAGE-60',
        serviceName: 'Masaż relaksacyjny',
      },
      {
        partnerType: 'TRAINING_B',
        partnerServiceId: 'B-TRAINING-60',
        serviceName: 'Trening personalny',
      },
    ],
  },
  {
    number: 'R-000003',
    roomNumber: '103',
    guest: EWA,
    from: -2,
    to: 1,
    guestsCount: 1,
    status: 'CHECKED_IN',
    source: 'PORTAL',
    voucherCode: null,
    voucherStatus: 'NONE',
    services: [],
  },
  {
    number: 'R-000004',
    roomNumber: '101',
    guest: JAN,
    from: 10,
    to: 12,
    guestsCount: 1,
    status: 'CANCELLED',
    source: 'RECEPTION',
    voucherCode: null,
    voucherStatus: 'NONE',
    services: [],
  },
] as const;

// Można uruchamiać wielokrotnie: rezerwacje testowe wracają do stanu z dokumentacji, a pozostałych skrypt nie rusza. (DamianTchorzewski_72206)
// Jeśli własna rezerwacja zajmuje pokój w terminie testowym, skrypt przerwie się błędem zamiast ją nadpisać. (DamianTchorzewski_72206)
export async function seedDatabase(
  prisma: PrismaClient,
  today: string = todayInHotel(),
): Promise<SeedSummary> {
  await prisma.$transaction(async (tx) => {
    for (const { code, ...fields } of ROOM_TYPES) {
      await tx.roomType.upsert({
        where: { code },
        create: { code, ...fields },
        update: fields,
      });
    }

    for (const { roomNumber, typeCode, isActive } of ROOMS) {
      const fields = {
        isActive,
        roomType: { connect: { code: typeCode } },
      };
      await tx.room.upsert({
        where: { roomNumber },
        create: { roomNumber, ...fields },
        update: fields,
      });
    }

    await seedReservations(tx, today);

    // Numery nadawane przez sekwencję nie mogą kolidować z numerami z danych startowych. (DamianTchorzewski_72206)
    await tx.$executeRaw`SELECT setval('reservation_number_seq', GREATEST((SELECT last_value FROM reservation_number_seq), ${RESERVATIONS.length}))`;
  });

  return {
    roomTypes: ROOM_TYPES.length,
    rooms: ROOMS.length,
    reservations: RESERVATIONS.length,
  };
}

async function seedReservations(
  tx: Prisma.TransactionClient,
  today: string,
): Promise<void> {
  // Usunięcie przed zapisem zwalnia pokoje, więc kolejność rezerwacji testowych nie ma znaczenia. (DamianTchorzewski_72206)
  await tx.reservation.deleteMany({
    where: { number: { in: RESERVATIONS.map((item) => item.number) } },
  });

  for (const item of RESERVATIONS) {
    const checkIn = addDays(today, item.from);
    const checkOut = addDays(today, item.to);
    const room = await tx.room.findUniqueOrThrow({
      where: { roomNumber: item.roomNumber },
      include: { roomType: true },
    });

    await tx.reservation.create({
      data: {
        number: item.number,
        roomId: room.id,
        checkIn: parseDateOnly(checkIn),
        checkOut: parseDateOnly(checkOut),
        guestsCount: item.guestsCount,
        totalPrice: calculateTotalPrice(
          room.roomType.basePricePerNight,
          nightsBetween(checkIn, checkOut),
        ),
        status: item.status,
        source: item.source,
        voucherCode: item.voucherCode,
        voucherStatus: item.voucherStatus,
        guests: { create: { ...item.guest, isPrimary: true } },
        services: {
          create: item.services.map((service) => ({
            ...service,
            source: 'PACKAGE' as const,
            status: 'TO_ORDER' as const,
          })),
        },
      },
    });
  }
}
