import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { seedDatabase } from '../../prisma/seed-data.js';
import { addDays, todayInHotel } from '../../src/common/dates/date-utils.js';
import { RoomAvailabilityService } from '../../src/modules/offers/room-availability.service.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { createIntegrationApp, resetDatabase } from './test-app.js';
import { TEST_API_KEY, TEST_LOGIN, TEST_PASSWORD } from './test-credentials.js';

const GUEST = {
  firstName: 'Piotr',
  lastName: 'Testowy',
  email: 'piotr.testowy@example.com',
  phone: '+48600700800',
};

// Scenariusze z dokumentacji 0.3 na danych startowych: przypadki brzegowe i kroki UAT. (DamianTchorzewski_72206)
describe('Hotel API on seed data', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cookie: string;
  let today: string;

  const day = (offset: number): string => addDays(today, offset);
  const http = () => request(app.getHttpServer());
  const availability = (from: number, to: number, guests: number) =>
    http()
      .get('/api/v1/availability')
      .query({ checkIn: day(from), checkOut: day(to), guests });
  const codes = (body: { items: { code: string }[] }): string[] =>
    body.items.map((item) => item.code);
  const portal = (overrides: Record<string, unknown> = {}) =>
    http()
      .post('/api/v1/portal/reservations')
      .send({
        roomTypeCode: 'DBL',
        checkIn: day(1),
        checkOut: day(4),
        guestsCount: 2,
        guest: GUEST,
        ...overrides,
      });
  const reception = (overrides: Record<string, unknown> = {}) =>
    http()
      .post('/api/v1/reservations')
      .set('Cookie', cookie)
      .send({
        roomTypeCode: 'SUITE',
        checkIn: day(5),
        checkOut: day(7),
        guestsCount: 2,
        guest: GUEST,
        ...overrides,
      });
  const cancel = (id: string) =>
    http().post(`/api/v1/reservations/${id}/cancel`).set('Cookie', cookie);
  const idOf = async (number: string): Promise<string> =>
    (await prisma.reservation.findUniqueOrThrow({ where: { number } })).id;
  const roomIdOf = async (roomNumber: string): Promise<string> =>
    (await prisma.room.findUniqueOrThrow({ where: { roomNumber } })).id;

  beforeAll(async () => {
    ({ app, prisma } = await createIntegrationApp());
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ login: TEST_LOGIN, password: TEST_PASSWORD })
      .expect(200);
    cookie = login.headers['set-cookie']![0]!.split(';')[0]!;
  });

  beforeEach(async () => {
    today = todayInHotel();
    await resetDatabase(prisma);
    await seedDatabase(prisma, today);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('seed', () => {
    it('can be run again and keeps reservations made by users', async () => {
      const created = await portal({ checkIn: day(20), checkOut: day(21) });
      await seedDatabase(prisma, today);

      expect(await prisma.reservation.count()).toBe(5);
      expect(created.body.number).toBe('R-000005');
      expect(
        (await portal({ checkIn: day(22), checkOut: day(23) })).body.number,
      ).toBe('R-000006');
    });
  });

  describe('offers and availability (US-02, US-03, US-21)', () => {
    it('lists all room types with prices', async () => {
      const { body } = await http().get('/api/v1/offers').expect(200);

      expect(codes(body)).toEqual(['SGL', 'DBL', 'TWN', 'SUITE']);
      expect(body.items[1]).toMatchObject({
        pricePerNight: 250,
        maxCapacity: 2,
        currency: 'PLN',
      });
    });

    it('UAT-02: returns DBL and SUITE with the price of three nights', async () => {
      const { body } = await availability(1, 4, 2).expect(200);

      expect(body.nights).toBe(3);
      // Pokój 103 zwalnia się w D0+1, a TWN jest zajęty do D0+2. (DamianTchorzewski_72206)
      expect(body.items).toMatchObject([
        { code: 'DBL', totalPrice: 750, availableRooms: 1 },
        { code: 'SUITE', totalPrice: 1350, availableRooms: 1 },
      ]);
      expect(body.items[0]).not.toHaveProperty('roomNumbers');
    });

    it('shows the numbers of free rooms only to the reception', async () => {
      const { body } = await availability(1, 4, 2).set('Cookie', cookie);

      expect(body.items[0].roomNumbers).toEqual(['103']);
    });

    it('hides a type without free rooms and never offers room 203', async () => {
      expect(codes((await availability(0, 1, 2)).body)).not.toContain('DBL');
      const later = await availability(20, 21, 2).set('Cookie', cookie);
      expect(later.body.items[0].roomNumbers).toEqual(['102', '103']);
    });

    it('a cancelled reservation does not block the room', async () => {
      expect(codes((await availability(10, 12, 1)).body)).toContain('SGL');
    });

    it('UAT-05: returns an empty list for five guests', async () => {
      expect((await availability(1, 2, 5).expect(200)).body.items).toEqual([]);
    });

    it.each([
      [-1, 1],
      [2, 2],
      [1, 32],
    ])('rejects the stay D0%i - D0+%i with INVALID_DATES', async (from, to) => {
      const { body } = await availability(from, to, 1).expect(400);

      expect(body.code).toBe('INVALID_DATES');
    });

    it('rejects less than one guest with VALIDATION_ERROR', async () => {
      const { body } = await availability(1, 2, 0).expect(400);

      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('requires an API key for partner endpoints', async () => {
      await http().get('/api/v1/external/offers').expect(401);
      const { body } = await http()
        .get('/api/v1/external/availability')
        .query({ checkIn: day(1), checkOut: day(4), guests: 2 })
        .set('X-API-Key', TEST_API_KEY)
        .set('Cookie', cookie)
        .expect(200);

      expect(codes(body)).toEqual(['DBL', 'SUITE']);
      expect(body.items[0]).not.toHaveProperty('roomNumbers');
    });
  });

  describe('rooms (US-01)', () => {
    it('UAT-01: shows six rooms with the status for today', async () => {
      const { body } = await http()
        .get('/api/v1/rooms')
        .set('Cookie', cookie)
        .expect(200);

      expect(
        body.items.map((room: Record<string, unknown>) => [
          room['roomNumber'],
          room['status'],
          room['currentReservationNumber'],
        ]),
      ).toEqual([
        ['101', 'FREE', null],
        ['102', 'OCCUPIED', 'R-000001'],
        ['103', 'OCCUPIED', 'R-000003'],
        ['201', 'OCCUPIED', 'R-000002'],
        ['202', 'FREE', null],
        ['203', 'DISABLED', null],
      ]);
    });

    it('filters by type and status', async () => {
      const { body } = await http()
        .get('/api/v1/rooms')
        .query({ type: 'DBL', status: 'OCCUPIED' })
        .set('Cookie', cookie);

      expect(body.items).toHaveLength(2);
    });

    it('lists future reservations of a room', async () => {
      await portal();
      const { body } = await http().get('/api/v1/rooms').set('Cookie', cookie);

      expect(body.items[2].upcomingReservations).toMatchObject([
        { number: 'R-000005', checkIn: day(1), checkOut: day(4) },
      ]);
    });

    it('is closed without a session', async () => {
      const { body } = await http().get('/api/v1/rooms').expect(401);

      expect(body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('portal reservations (US-05)', () => {
    it('UAT-03: books room 103 once and refuses the second guest', async () => {
      const first = await portal().expect(201);
      const second = await portal().expect(409);

      expect(first.body).toEqual({
        number: 'R-000005',
        status: 'CONFIRMED',
        roomTypeCode: 'DBL',
        roomTypeName: 'Pokój dwuosobowy',
        roomNumber: '103',
        checkIn: day(1),
        checkOut: day(4),
        nights: 3,
        guestsCount: 2,
        totalPrice: 750,
        currency: 'PLN',
      });
      expect(second.body.code).toBe('ROOM_NOT_AVAILABLE');
      expect(await prisma.reservation.count()).toBe(5);
    });

    it('assigns the free room with the lowest number (RB-06)', async () => {
      const { body } = await portal({ checkIn: day(20), checkOut: day(21) });

      expect(body.roomNumber).toBe('102');
    });

    it('allows arrival on the day another guest leaves', async () => {
      const { body } = await portal({ checkIn: day(3), checkOut: day(5) });

      expect(body.roomNumber).toBe('102');
    });

    it.each([
      [{ guestsCount: 3 }, 'CAPACITY_EXCEEDED'],
      [{ guestsCount: 0 }, 'VALIDATION_ERROR'],
      [{ roomTypeCode: 'XXX' }, 'VALIDATION_ERROR'],
      [{ guest: { ...GUEST, email: 'wrong' } }, 'VALIDATION_ERROR'],
      [{ roomId: 'a1b2c3d4-e5f6-4890-abcd-ef1234567890' }, 'VALIDATION_ERROR'],
      [{ checkIn: '2020-01-01' }, 'INVALID_DATES'],
    ])('rejects %j with %s', async (overrides, code) => {
      const { body } = await portal(overrides).expect(400);

      expect(body.code).toBe(code);
      expect(await prisma.reservation.count()).toBe(4);
    });

    it('creates one reservation when two requests race for the last room', async () => {
      const service = app.get(RoomAvailabilityService);
      const original = service.findFreeRooms.bind(service);
      let waiting = 0;
      let release: () => void = () => undefined;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      // Obie transakcje muszą zobaczyć wolny pokój, zanim którakolwiek zapisze rezerwację. (DamianTchorzewski_72206)
      vi.spyOn(service, 'findFreeRooms').mockImplementation(async (...args) => {
        const rooms = await original(...args);
        waiting += 1;
        if (waiting === 2) release();
        if (waiting <= 2) await barrier;
        return rooms;
      });

      const results = await Promise.all([portal(), portal()]);

      expect(
        results.map((result) => result.status).sort((a, b) => a - b),
      ).toEqual([201, 409]);
      expect(waiting).toBeGreaterThanOrEqual(3);
      expect(await prisma.reservation.count()).toBe(5);
    });

    it('gives two racing guests different rooms when two are free', async () => {
      const results = await Promise.all([
        portal({ checkIn: day(20), checkOut: day(21) }),
        portal({ checkIn: day(20), checkOut: day(21) }),
      ]);

      expect(new Set(results.map((result) => result.body.roomNumber))).toEqual(
        new Set(['102', '103']),
      );
    });
  });

  describe('reception reservations (US-08, US-10)', () => {
    it('UAT-04: refuses the occupied room 102 and books the suite', async () => {
      const refused = await reception({
        roomTypeCode: 'DBL',
        roomId: await roomIdOf('102'),
        checkIn: day(1),
        checkOut: day(2),
      }).expect(409);
      const booked = await reception().expect(201);

      expect(refused.body.code).toBe('ROOM_NOT_AVAILABLE');
      expect(booked.body).toMatchObject({
        source: 'RECEPTION',
        status: 'CONFIRMED',
        roomNumber: '202',
        totalPrice: 900,
        voucherStatus: 'NONE',
        guest: GUEST,
        services: [],
      });
    });

    it('refuses the disabled room 203 and a room of another type', async () => {
      const disabled = await reception({
        roomTypeCode: 'DBL',
        roomId: await roomIdOf('203'),
      }).expect(409);
      const otherType = await reception({
        roomId: await roomIdOf('102'),
      }).expect(400);

      expect(disabled.body.code).toBe('ROOM_NOT_AVAILABLE');
      expect(otherType.body.code).toBe('VALIDATION_ERROR');
    });

    it('requires a session', async () => {
      await http().post('/api/v1/reservations').send({}).expect(401);
      await http()
        .post(`/api/v1/reservations/${await idOf('R-000001')}/cancel`)
        .expect(401);
    });

    it('cancels a stay with its services, frees the room and is idempotent', async () => {
      const id = await idOf('R-000002');
      const first = await cancel(id).expect(200);
      const second = await cancel(id).expect(200);

      expect(first.body.status).toBe('CANCELLED');
      expect(
        first.body.services.map((item: { status: string }) => item.status),
      ).toEqual(['CANCELLED', 'CANCELLED']);
      expect(second.body).toEqual(first.body);
      expect(codes((await availability(0, 1, 2)).body)).toContain('TWN');
    });

    it('leaves a confirmed partner service for a retry', async () => {
      const id = await idOf('R-000002');
      await prisma.partnerServiceBooking.updateMany({
        where: { reservationId: id, partnerType: 'MASSAGE_A' },
        data: { status: 'CONFIRMED' },
      });

      const { body } = await cancel(id).expect(200);

      expect(
        body.services.map((item: { status: string }) => item.status).sort(),
      ).toEqual(['CANCELLED', 'CANCEL_RETRY']);
    });

    it('does not cancel a stay in progress or an unknown reservation', async () => {
      const inProgress = await cancel(await idOf('R-000003')).expect(409);

      expect(inProgress.body.code).toBe('INVALID_STATE');
      await cancel('a1b2c3d4-e5f6-4890-abcd-ef1234567890').expect(404);
      await cancel('not-a-uuid').expect(404);
    });
  });

  describe('database constraints', () => {
    it('allows only one active reservation per voucher (RB-18)', async () => {
      const base = {
        roomId: await roomIdOf('202'),
        checkIn: new Date(`${day(40)}T00:00:00Z`),
        checkOut: new Date(`${day(41)}T00:00:00Z`),
        guestsCount: 1,
        totalPrice: 450,
        source: 'PARTNER_D' as const,
        voucherCode: 'TEST-C-0001',
      };

      await expect(prisma.reservation.create({ data: base })).rejects.toThrow();
      await cancel(await idOf('R-000002')).expect(200);
      await expect(
        prisma.reservation.create({ data: base }),
      ).resolves.toBeDefined();
    });
  });

  describe('session (US-27)', () => {
    it('reports the logged in account and ends after logout', async () => {
      const me = await http()
        .get('/api/v1/auth/me')
        .set('Cookie', cookie)
        .expect(200);
      const logout = await http().post('/api/v1/auth/logout').expect(204);

      expect(me.body).toEqual({ login: TEST_LOGIN });
      expect(logout.headers['set-cookie']![0]).toMatch(/hotel_session=;/);
      await http().get('/api/v1/auth/me').expect(401);
    });

    it('sets a HttpOnly, SameSite cookie valid for eight hours', async () => {
      const { headers } = await http()
        .post('/api/v1/auth/login')
        .send({ login: TEST_LOGIN, password: TEST_PASSWORD });
      const value = headers['set-cookie']![0]!;

      expect(value).toContain('HttpOnly');
      expect(value).toContain('SameSite=Lax');
      expect(value).toContain('Max-Age=28800');
    });
  });
});
