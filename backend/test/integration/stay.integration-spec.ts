import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PartnerMocks } from '../../mocks/partner-mocks.js';
import { seedDatabase } from '../../prisma/seed-data.js';
import { addDays, todayInHotel } from '../../src/common/dates/date-utils.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { createIntegrationApp, resetDatabase } from './test-app.js';
import {
  TEST_API_KEY,
  TEST_LOGIN,
  TEST_MOCKS_PORT,
  TEST_OTHER_API_KEY,
  TEST_PASSWORD,
} from './test-credentials.js';

const GUEST = {
  firstName: 'Piotr',
  lastName: 'Testowy',
  email: 'piotr_testowy@example.com',
  phone: '+48600700800',
};

interface Service {
  id: string;
  partnerType: string;
  status: string;
  rejectionReason: string | null;
}

// Pełna obsługa pobytu z atrapami partnerów działającymi po HTTP, jak w prawdziwej integracji. (DamianTchorzewski_72206)
describe('Stay, partners and vouchers', () => {
  const mocks = new PartnerMocks();
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cookie = '';
  let today: string;

  const day = (offset: number): string => addDays(today, offset);
  const at = (offset: number, hour: number): string =>
    `${day(offset)}T${String(hour).padStart(2, '0')}:00:00Z`;
  const http = () => request(app.getHttpServer());
  const get = (path: string) =>
    http().get(`/api/v1${path}`).set('Cookie', cookie);
  const post = (path: string, body: object = {}) =>
    http().post(`/api/v1${path}`).set('Cookie', cookie).send(body);
  const patch = (id: string, body: object) =>
    http().patch(`/api/v1/reservations/${id}`).set('Cookie', cookie).send(body);
  const idOf = async (number: string): Promise<string> =>
    (await prisma.reservation.findUniqueOrThrow({ where: { number } })).id;
  const roomIdOf = async (roomNumber: string): Promise<string> =>
    (await prisma.room.findUniqueOrThrow({ where: { roomNumber } })).id;
  const stored = (id: string) =>
    prisma.reservation.findUniqueOrThrow({ where: { id } });

  const external = (
    method: 'get' | 'post' | 'patch',
    path = '',
    key = TEST_API_KEY,
  ) =>
    http()
      [method](`/api/v1/external/reservations${path}`)
      .set('X-API-Key', key);
  const voucherBody = (overrides: object = {}) => ({
    roomTypeCode: 'SUITE',
    checkIn: day(0),
    checkOut: day(2),
    guestsCount: 2,
    guest: GUEST,
    voucherCode: 'TEST-C-0004',
    packageServices: [
      {
        partnerType: 'MASSAGE_A',
        partnerServiceId: 'A-MASSAGE-60',
        serviceName: 'Masaż relaksacyjny',
        quantity: 2,
      },
    ],
    ...overrides,
  });
  const book = (key: string, overrides: object = {}) =>
    external('post').set('Idempotency-Key', key).send(voucherBody(overrides));

  // Pozycje planu R-000002 z danych startowych: masaż A i trening B. (DamianTchorzewski_72206)
  const planOf = async (number: string) => {
    const id = await idOf(number);
    const { body } = await get(`/reservations/${id}`).expect(200);
    const find = (type: string): string =>
      (body.services as Service[]).find((item) => item.partnerType === type)!
        .id;
    return {
      id,
      massage: find('MASSAGE_A'),
      training: find('TRAINING_B'),
    };
  };
  const bookService = (id: string, serviceId: string, scheduledAt: string) =>
    post(`/reservations/${id}/services/${serviceId}/book`, { scheduledAt });
  const cancelService = (id: string, serviceId: string) =>
    post(`/reservations/${id}/services/${serviceId}/cancel`);

  beforeAll(async () => {
    await mocks.start(TEST_MOCKS_PORT);
    ({ app, prisma } = await createIntegrationApp());
    const login = await post('/auth/login', {
      login: TEST_LOGIN,
      password: TEST_PASSWORD,
    }).expect(200);
    cookie = login.headers['set-cookie']![0]!.split(';')[0]!;
  });

  beforeEach(async () => {
    today = todayInHotel();
    mocks.reset();
    await resetDatabase(prisma);
    await seedDatabase(prisma, today);
  });

  afterAll(async () => {
    await app.close();
    await mocks.stop();
  });

  describe('list and details (US-11, US-12)', () => {
    it('shows arrivals and departures of today by default', async () => {
      const { body } = await get('/reservations').expect(200);

      expect(body.items.map((item: { number: string }) => item.number)).toEqual(
        ['R-000001', 'R-000002'],
      );
      expect(body).toMatchObject({ total: 2, page: 1, pageSize: 20 });
    });

    it.each([
      [{ q: 'kowal' }, ['R-000001']],
      [{ q: 'r-00000' }, ['R-000003', 'R-000001', 'R-000002', 'R-000004']],
      [{ q: '%' }, []],
      [{ q: '_' }, []],
      [{ status: 'CANCELLED' }, ['R-000004']],
      [{ source: 'PARTNER_D' }, ['R-000002']],
      [{ status: 'CONFIRMED', source: 'RECEPTION' }, ['R-000001']],
      [{ q: 'R-', pageSize: 1, page: 2 }, ['R-000001']],
    ])('filters by %j', async (query, expected) => {
      const { body } = await get('/reservations').query(query).expect(200);

      expect(body.items.map((item: { number: string }) => item.number)).toEqual(
        expected,
      );
    });

    it('returns stays that overlap the date range', async () => {
      const { body } = await get('/reservations').query({
        from: day(3),
        to: day(11),
      });

      expect(body.items.map((item: { number: string }) => item.number)).toEqual(
        ['R-000001', 'R-000004'],
      );
    });

    it('rejects invalid paging and requires a session', async () => {
      await get('/reservations').query({ pageSize: 101 }).expect(400);
      await get('/reservations').query({ page: 0 }).expect(400);
      await http().get('/api/v1/reservations').expect(401);
      await get('/reservations/a1b2c3d4-e5f6-4890-abcd-ef1234567890').expect(
        404,
      );
    });
  });

  describe('guest lookup (US-06, UAT-21)', () => {
    const lookup = (number: string, email: string) =>
      http().get(`/api/v1/portal/reservations/${number}`).query({ email });

    it('shows the stay for the right number and e-mail only', async () => {
      const { body } = await lookup('R-000001', 'ANNA.kowalska@example.com');
      const wrongEmail = await lookup('R-000001', 'anna@example.com');
      const wrongNumber = await lookup('R-999999', 'anna@example.com');

      expect(body).toMatchObject({ number: 'R-000001', services: [] });
      expect(body).not.toHaveProperty('id');
      expect(body).not.toHaveProperty('guest');
      expect(wrongEmail.status).toBe(404);
      expect(wrongEmail.body.message).toBe(wrongNumber.body.message);
    });
  });

  describe('change of a reservation (US-09)', () => {
    const suite = async () =>
      (
        await post('/reservations', {
          roomTypeCode: 'SUITE',
          checkIn: day(5),
          checkOut: day(7),
          guestsCount: 2,
          guest: GUEST,
        }).expect(201)
      ).body.id as string;

    it('UAT-06: extends the stay, recalculates the price and refuses the past', async () => {
      const id = await suite();
      const extended = await patch(id, { checkOut: day(8) }).expect(200);
      const past = await patch(id, { checkIn: day(-1) }).expect(400);

      expect(extended.body).toMatchObject({
        totalPrice: 1350,
        roomNumber: '202',
      });
      expect(past.body.code).toBe('INVALID_DATES');
    });

    it('moves the guest to another free room of the type', async () => {
      const created = await post('/reservations', {
        roomTypeCode: 'DBL',
        roomId: await roomIdOf('102'),
        checkIn: day(4),
        checkOut: day(6),
        guestsCount: 2,
        guest: GUEST,
      }).expect(201);

      const moved = await patch(created.body.id, { checkIn: day(2) });

      expect(moved.body).toMatchObject({ roomNumber: '103', nights: 4 });
    });

    it('leaves the reservation unchanged when no room is free', async () => {
      const id = await idOf('R-000002');
      const before = await stored(id);
      const taken = await patch(id, {
        roomTypeCode: 'DBL',
        roomId: await roomIdOf('102'),
      }).expect(409);

      expect(taken.body.code).toBe('ROOM_NOT_AVAILABLE');
      expect(await stored(id)).toEqual(before);
    });

    it('checks the capacity of the new type', async () => {
      const { body } = await patch(await idOf('R-000001'), {
        roomTypeCode: 'SGL',
      }).expect(400);

      expect(body.code).toBe('CAPACITY_EXCEEDED');
    });

    it('changes guest data without touching the price', async () => {
      const id = await idOf('R-000001');
      await prisma.roomType.update({
        where: { code: 'DBL' },
        data: { basePricePerNight: 999 },
      });
      const { body } = await patch(id, { guest: GUEST, notes: 'uwaga' });

      expect(body).toMatchObject({
        guest: GUEST,
        notes: 'uwaga',
        totalPrice: 750,
      });
    });

    it('allows only notes after check-in and nothing after cancellation', async () => {
      const inProgress = await idOf('R-000003');
      const cancelled = await idOf('R-000004');

      await patch(inProgress, { notes: 'wcześniejszy wyjazd' }).expect(200);
      const stay = await patch(inProgress, { checkOut: day(2) }).expect(409);
      const both = await patch(inProgress, {
        notes: 'x',
        guestsCount: 1,
      }).expect(409);
      const notes = await patch(cancelled, { notes: 'x' }).expect(409);

      for (const response of [stay, both, notes]) {
        expect(response.body.code).toBe('INVALID_STATE');
      }
    });

    it('refuses dates that leave a confirmed service outside the stay', async () => {
      const plan = await planOf('R-000002');
      await bookService(plan.id, plan.massage, at(2, 10)).expect(200);

      const { body } = await patch(plan.id, { checkOut: day(1) }).expect(409);

      expect(body.code).toBe('SERVICES_OUTSIDE_STAY');
      expect(body.details[0].field).toBe(`services.${plan.massage}`);
    });
  });

  describe('services of partners (US-13 - US-16)', () => {
    it('UAT-08 and UAT-09: books a massage and a training with the voucher code', async () => {
      const plan = await planOf('R-000002');
      const massage = await bookService(plan.id, plan.massage, at(1, 10));
      const training = await bookService(plan.id, plan.training, at(1, 12));

      expect(massage.body).toMatchObject({
        status: 'CONFIRMED',
        durationMinutes: 60,
        scheduledAt: new Date(at(1, 10)).toISOString(),
      });
      expect(training.body.status).toBe('CONFIRMED');
      const call = mocks.calls.find((item) => item.path === '/bookings')!;
      expect(call.body).toMatchObject({
        reference: `${plan.massage}:${new Date(at(1, 10)).toISOString()}`,
        hotelReservationNumber: 'R-000002',
        voucherCode: 'TEST-C-0001',
        guest: { lastName: 'Nowak' },
      });
      expect(call.body).not.toHaveProperty('reservationId');
      const log = await prisma.integrationLog.findFirstOrThrow({
        where: { endpoint: 'POST /bookings' },
      });
      expect(log).toMatchObject({
        partner: 'A',
        httpStatus: 201,
        reservationId: plan.id,
        errorMessage: null,
      });
    });

    it('UAT-10: adds an extra service with the price of the partner', async () => {
      const id = await idOf('R-000001');
      const added = await post(`/reservations/${id}/services`, {
        partnerType: 'MASSAGE_A',
        partnerServiceId: 'A-MASSAGE-60',
      }).expect(201);
      const booked = await bookService(id, added.body.id, at(1, 11));

      expect(added.body).toMatchObject({
        source: 'EXTRA',
        status: 'TO_ORDER',
        price: 180,
        serviceName: 'Masaż relaksacyjny',
      });
      expect(booked.body.status).toBe('CONFIRMED');
      expect(mocks.calls.at(-1)?.body['voucherCode']).toBeNull();
      const unknown = await post(`/reservations/${id}/services`, {
        partnerType: 'MASSAGE_A',
        partnerServiceId: 'NOPE',
      }).expect(400);
      expect(unknown.body.code).toBe('VALIDATION_ERROR');
    });

    it('UAT-11: a refused slot rejects only the service, another slot works', async () => {
      const plan = await planOf('R-000002');
      mocks.setMode('a', 'refuse');
      const refused = await bookService(plan.id, plan.massage, at(1, 10));
      mocks.setMode('a', 'ok');
      const booked = await bookService(plan.id, plan.massage, at(1, 14));

      expect(refused.body).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'SLOT_TAKEN',
        scheduledAt: null,
      });
      expect(booked.body).toMatchObject({
        status: 'CONFIRMED',
        rejectionReason: null,
      });
      expect((await stored(plan.id)).status).toBe('CONFIRMED');
    });

    it('UAT-12: a partner that does not answer is given up after five seconds', async () => {
      const plan = await planOf('R-000002');
      mocks.setMode('b', 'delay');
      const startedAt = Date.now();
      const { body } = await bookService(plan.id, plan.training, at(1, 10));
      const elapsed = Date.now() - startedAt;

      expect(body).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'PARTNER_UNAVAILABLE',
      });
      expect(elapsed).toBeGreaterThan(4_500);
      expect(elapsed).toBeLessThan(6_000);
      const log = await prisma.integrationLog.findFirstOrThrow({
        where: { partner: 'B' },
      });
      expect(log.httpStatus).toBeNull();
      expect(log.errorMessage).not.toBeNull();
    });

    it('UAT-13: checks conflicts and the stay window before calling the partner', async () => {
      const plan = await planOf('R-000002');
      await bookService(plan.id, plan.massage, at(1, 10)).expect(200);
      const callsBefore = mocks.calls.length;

      const same = await bookService(plan.id, plan.training, at(1, 10));
      const outside = await bookService(plan.id, plan.training, at(5, 10));

      expect(same.body.code).toBe('SERVICE_TIME_CONFLICT');
      expect(outside.body.code).toBe('SERVICE_OUTSIDE_STAY');
      expect(mocks.calls.length).toBe(callsBefore);
    });

    it('detects a conflict that comes from the duration of the service', async () => {
      const plan = await planOf('R-000002');
      await bookService(plan.id, plan.massage, at(1, 10)).expect(200);
      const { body } = await bookService(
        plan.id,
        plan.training,
        `${day(1)}T09:30:00Z`,
      ).expect(409);

      expect(body.code).toBe('SERVICE_TIME_CONFLICT');
      expect(
        mocks.calls.some(
          (call) => call.partner === 'b' && call.path === '/bookings',
        ),
      ).toBe(false);
    });

    it('books a service once when two requests come together', async () => {
      const plan = await planOf('R-000002');
      const results = await Promise.all([
        bookService(plan.id, plan.massage, at(1, 10)),
        bookService(plan.id, plan.massage, at(1, 12)),
      ]);

      expect(
        results.map((result) => result.status).sort((a, b) => a - b),
      ).toEqual([200, 409]);
      expect(
        mocks.calls.filter((call) => call.path === '/bookings'),
      ).toHaveLength(1);
    });

    it('requires a time zone and a session', async () => {
      const plan = await planOf('R-000002');
      await bookService(plan.id, plan.massage, `${day(1)}T10:00:00`).expect(
        400,
      );
      await http()
        .post(`/api/v1/reservations/${plan.id}/services/${plan.massage}/book`)
        .expect(401);
    });

    it('returns a cancelled package service to the pool and drops an extra one', async () => {
      const plan = await planOf('R-000002');
      await bookService(plan.id, plan.massage, at(1, 10)).expect(200);
      const fromPackage = await cancelService(plan.id, plan.massage);
      const again = await cancelService(plan.id, plan.massage).expect(409);
      const added = await post(`/reservations/${plan.id}/services`, {
        partnerType: 'TRAINING_B',
        partnerServiceId: 'B-TRAINING-60',
      });
      const extra = await cancelService(plan.id, added.body.id);
      const extraAgain = await cancelService(plan.id, added.body.id);

      expect(fromPackage.body).toMatchObject({
        status: 'TO_ORDER',
        scheduledAt: null,
      });
      expect(again.body.code).toBe('INVALID_STATE');
      expect(extra.body.status).toBe('CANCELLED');
      expect(extraAgain.status).toBe(200);
    });

    it('UAT-19: cancelling a stay cancels its booked services at the partner', async () => {
      const plan = await planOf('R-000002');
      await bookService(plan.id, plan.massage, at(1, 10)).expect(200);
      const { body } = await post(`/reservations/${plan.id}/cancel`);
      await post(`/reservations/${plan.id}/cancel`).expect(200);

      expect(
        (body.services as Service[]).map((service) => service.status),
      ).toEqual(['CANCELLED', 'CANCELLED']);
      expect(
        mocks.calls.filter((call) => call.path.endsWith('/cancel')),
      ).toHaveLength(1);
    });
  });

  describe('moving a service (US-17)', () => {
    const move = (id: string, serviceId: string, scheduledAt: string) =>
      post(`/reservations/${id}/services/${serviceId}/reschedule`, {
        scheduledAt,
      });
    const booked = async () => {
      const plan = await planOf('R-000002');
      await bookService(plan.id, plan.massage, at(1, 10)).expect(200);
      return plan;
    };
    const partnerCalls = () =>
      mocks.calls
        .filter((call) => call.partner === 'a' && call.method === 'POST')
        .map((call) => call.path);

    it('books the new time before cancelling the old one', async () => {
      const plan = await booked();
      const { body } = await move(plan.id, plan.massage, at(1, 14)).expect(200);

      expect(body).toMatchObject({
        status: 'CONFIRMED',
        scheduledAt: new Date(at(1, 14)).toISOString(),
      });
      expect(partnerCalls()).toEqual([
        '/bookings',
        '/bookings',
        expect.stringMatching(/^\/bookings\/A-\d+\/cancel$/),
      ]);
      expect((await get('/retry-tasks')).body.items).toEqual([]);
    });

    it.each([
      ['refuse', 409, 'SLOT_TAKEN'],
      ['error', 503, 'PARTNER_UNAVAILABLE'],
    ] as const)('keeps the old time on %s', async (mode, status, code) => {
      const plan = await booked();
      mocks.setMode('a', mode);
      const { body } = await move(plan.id, plan.massage, at(1, 14)).expect(
        status,
      );
      const after = await get(`/reservations/${plan.id}`);

      expect(body.code).toBe(code);
      expect(
        (after.body.services as (Service & { scheduledAt: string })[])[0],
      ).toMatchObject({
        status: 'CONFIRMED',
        scheduledAt: new Date(at(1, 10)).toISOString(),
      });
      expect(partnerCalls().some((path) => path.endsWith('/cancel'))).toBe(
        false,
      );
    });

    it('leaves a task when the old time cannot be cancelled', async () => {
      const plan = await booked();
      mocks.failNextCancel = true;
      const moved = await move(plan.id, plan.massage, at(1, 14)).expect(200);
      const again = await move(plan.id, plan.massage, at(1, 16)).expect(409);
      const tasks = await get('/retry-tasks');
      const done = await post(`/retry-tasks/moved:${plan.massage}/retry`);

      expect(moved.body.status).toBe('CONFIRMED');
      expect(again.body.code).toBe('INVALID_STATE');
      expect(tasks.body.items).toMatchObject([
        { id: `moved:${plan.massage}`, type: 'CANCEL_SERVICE', partner: 'A' },
      ]);
      expect(done.body).toMatchObject({ done: true, status: 'CONFIRMED' });
      await move(plan.id, plan.massage, at(1, 16)).expect(200);
    });

    it('checks the window, conflicts and the state before calling the partner', async () => {
      const plan = await booked();
      await bookService(plan.id, plan.training, at(1, 12)).expect(200);
      const callsBefore = mocks.calls.length;
      const conflict = await move(plan.id, plan.massage, at(1, 12));
      const outside = await move(plan.id, plan.massage, at(5, 12));
      const same = await move(plan.id, plan.massage, at(1, 10));

      expect(conflict.body.code).toBe('SERVICE_TIME_CONFLICT');
      expect(outside.body.code).toBe('SERVICE_OUTSIDE_STAY');
      expect(same.status).toBe(200);
      expect(mocks.calls.length).toBe(callsBefore);
      await cancelService(plan.id, plan.training).expect(200);
      const notBooked = await move(plan.id, plan.training, at(1, 15));
      expect(notBooked.body.code).toBe('INVALID_STATE');
    });
  });

  describe('partner offers (US-07, UAT-22)', () => {
    it('shows live services to the reception and reports an outage', async () => {
      const services = await get('/partners/A/services').expect(200);
      const slots = await get('/partners/B/slots')
        .query({ date: day(1) })
        .expect(200);
      mocks.setMode('a', 'error');
      const outage = await get('/partners/A/services').expect(503);

      expect(services.body.items[0]).toMatchObject({
        id: 'A-MASSAGE-60',
        price: 180,
      });
      expect(slots.body.items).toHaveLength(9);
      expect(outage.body.code).toBe('PARTNER_UNAVAILABLE');
      await get('/partners/C/services').expect(400);
      await http().get('/api/v1/partners/A/services').expect(401);
    });

    it('keeps the last known offer in the portal', async () => {
      const first = await http().get('/api/v1/partner-offers').expect(200);
      mocks.setMode('a', 'error');
      const callsBefore = mocks.calls.length;
      const second = await http().get('/api/v1/partner-offers').expect(200);

      expect(first.body.partners).toMatchObject([
        { partner: 'A', available: true },
        { partner: 'B', available: true },
      ]);
      expect(second.body).toEqual(first.body);
      expect(mocks.calls.length).toBe(callsBefore);
    });
  });

  describe('check-in and check-out (US-18, US-19)', () => {
    const checkIn = (id: string, body: object = {}) =>
      post(`/reservations/${id}/check-in`, body);
    const checkOut = (id: string) => post(`/reservations/${id}/check-out`);

    it('checks in a guest without a voucher without calling system D', async () => {
      const { body } = await checkIn(await idOf('R-000001')).expect(200);

      expect(body).toMatchObject({
        status: 'CHECKED_IN',
        voucherStatus: 'NONE',
      });
      expect(mocks.calls).toHaveLength(0);
    });

    it('UAT-14 and UAT-18: verifies the voucher, settles it and frees the room', async () => {
      const id = await idOf('R-000002');
      const arrived = await checkIn(id).expect(200);
      const left = await checkOut(id).expect(200);
      const again = await checkOut(id).expect(409);
      const free = await http()
        .get('/api/v1/availability')
        .query({ checkIn: day(1), checkOut: day(2), guests: 2 });

      expect(arrived.body.voucherStatus).toBe('VERIFIED');
      expect(left.body).toMatchObject({
        status: 'COMPLETED',
        voucherStatus: 'SETTLED',
      });
      expect(again.body.code).toBe('INVALID_STATE');
      expect(
        free.body.items.map((item: { code: string }) => item.code),
      ).toContain('TWN');
      expect(
        mocks.calls.filter((call) => call.path === '/vouchers/settle'),
      ).toHaveLength(1);
    });

    it('UAT-15: refuses an early arrival until the reservation is changed', async () => {
      const created = await post('/reservations', {
        roomTypeCode: 'SUITE',
        checkIn: day(5),
        checkOut: day(8),
        guestsCount: 2,
        guest: GUEST,
      });
      const early = await checkIn(created.body.id).expect(409);
      await patch(created.body.id, { checkIn: day(0), checkOut: day(3) });
      await checkIn(created.body.id).expect(200);

      expect(early.body.code).toBe('CHECK_IN_NOT_ALLOWED');
    });

    it('UAT-16: refuses an invalid voucher and remembers it', async () => {
      const created = await book('uat-16', {
        roomTypeCode: 'SGL',
        guestsCount: 1,
        voucherCode: 'TEST-C-0002',
        checkOut: day(1),
      });
      const { body } = await checkIn(created.body.id).expect(422);

      expect(body.code).toBe('VOUCHER_INVALID');
      expect(await stored(created.body.id)).toMatchObject({
        status: 'CONFIRMED',
        voucherStatus: 'INVALID',
      });
      // Odrzuconego vouchera nie można ominąć zameldowaniem warunkowym. (DamianTchorzewski_72206)
      mocks.setMode('d', 'error');
      await checkIn(created.body.id, { conditional: true }).expect(503);
    });

    it('UAT-17: conditional check-in leaves a task that verifies the voucher later', async () => {
      const created = await book('uat-17', {
        roomTypeCode: 'SGL',
        guestsCount: 1,
        checkOut: day(1),
      });
      const id = created.body.id as string;
      mocks.setMode('d', 'error');
      const refused = await checkIn(id).expect(503);
      const conditional = await checkIn(id, { conditional: true }).expect(200);
      const tasks = await get('/retry-tasks').expect(200);
      const failed = await post(`/retry-tasks/voucher:${id}/retry`);
      mocks.setMode('d', 'ok');
      const done = await post(`/retry-tasks/voucher:${id}/retry`).expect(200);

      expect(refused.body.code).toBe('PARTNER_UNAVAILABLE');
      expect(conditional.body).toMatchObject({
        status: 'CHECKED_IN',
        voucherStatus: 'PENDING_VERIFICATION',
      });
      expect(tasks.body.items).toMatchObject([
        { id: `voucher:${id}`, type: 'VERIFY_VOUCHER', partner: 'D' },
      ]);
      expect(failed.body).toMatchObject({
        done: false,
        status: 'PENDING_VERIFICATION',
      });
      expect(done.body).toMatchObject({ done: true, status: 'VERIFIED' });
      expect((await get('/retry-tasks')).body.items).toEqual([]);
      await post(`/retry-tasks/voucher:${id}/retry`).expect(404);
    });

    it('lets the guest leave when system D is down and settles later, once', async () => {
      const id = await idOf('R-000002');
      await checkIn(id).expect(200);
      mocks.setMode('d', 'error');
      const left = await checkOut(id).expect(200);
      mocks.setMode('d', 'ok');
      const done = await post(`/retry-tasks/voucher:${id}/retry`);
      await post(`/retry-tasks/voucher:${id}/retry`).expect(404);

      expect(left.body).toMatchObject({
        status: 'COMPLETED',
        voucherStatus: 'SETTLEMENT_RETRY',
      });
      expect(done.body).toMatchObject({ done: true, status: 'SETTLED' });
    });

    it('verifies and settles at check-out after a conditional check-in', async () => {
      const id = await idOf('R-000002');
      mocks.setMode('d', 'error');
      await checkIn(id, { conditional: true }).expect(200);
      mocks.setMode('d', 'ok');
      const { body } = await checkOut(id).expect(200);

      expect(body.voucherStatus).toBe('SETTLED');
    });

    it('finishes the stay with an invalid voucher without settling it', async () => {
      const created = await book('invalid', { voucherCode: 'TEST-C-0003' });
      mocks.setMode('d', 'error');
      await checkIn(created.body.id, { conditional: true }).expect(200);
      mocks.setMode('d', 'ok');
      const { body } = await checkOut(created.body.id).expect(200);

      expect(body).toMatchObject({
        status: 'COMPLETED',
        voucherStatus: 'INVALID',
      });
      expect(mocks.calls.some((call) => call.path === '/vouchers/settle')).toBe(
        false,
      );
    });
  });

  describe('retry of a service cancellation (US-20)', () => {
    const prepare = async () => {
      const plan = await planOf('R-000002');
      await bookService(plan.id, plan.massage, at(1, 10)).expect(200);
      mocks.setMode('a', 'error');
      return plan;
    };
    const retry = (plan: { massage: string }) =>
      post(`/retry-tasks/service:${plan.massage}/retry`).expect(200);

    it('returns the package service to the pool after a single cancellation', async () => {
      const plan = await prepare();
      const cancelled = await cancelService(plan.id, plan.massage).expect(200);
      const failed = await retry(plan);
      mocks.setMode('a', 'ok');
      const done = await retry(plan);

      expect(cancelled.body.status).toBe('CANCEL_RETRY');
      expect(failed.body).toMatchObject({ done: false });
      expect(done.body).toMatchObject({ done: true, status: 'TO_ORDER' });
    });

    it('cancels the package service after the stay was cancelled', async () => {
      const plan = await prepare();
      const { body } = await post(`/reservations/${plan.id}/cancel`);
      mocks.setMode('a', 'ok');
      const done = await retry(plan);

      expect(body.status).toBe('CANCELLED');
      expect(done.body).toMatchObject({ done: true, status: 'CANCELLED' });
    });

    it.each(['service:x', 'other:1', 'voucher'])(
      'does not know the task %s',
      async (id) => {
        await post(`/retry-tasks/${id}/retry`).expect(404);
      },
    );
  });

  describe('API of system D (US-22, US-23)', () => {
    it('creates a reservation with the pool of package services', async () => {
      const { body } = await book('key-1').expect(201);

      expect(body).toMatchObject({
        status: 'CONFIRMED',
        source: 'PARTNER_D',
        voucherStatus: 'PENDING_VERIFICATION',
        voucherCode: 'TEST-C-0004',
        totalPrice: 900,
      });
      expect(body.services).toHaveLength(2);
      expect(body.services[0]).toMatchObject({
        source: 'PACKAGE',
        status: 'TO_ORDER',
      });
      expect(body).not.toHaveProperty('notes');
    });

    it('is idempotent and refuses another request with the same key', async () => {
      const first = await book('key-1').expect(201);
      const second = await book('key-1').expect(200);
      const other = await book('key-1', { guestsCount: 1 }).expect(409);

      expect(second.body).toEqual(first.body);
      expect(other.body.code).toBe('IDEMPOTENCY_CONFLICT');
      expect(await prisma.reservation.count()).toBe(5);
    });

    it('creates one reservation for parallel repeated requests', async () => {
      const results = await Promise.all([
        book('key-1'),
        book('key-1'),
        book('key-1'),
      ]);

      expect(new Set(results.map((item) => item.body.id)).size).toBe(1);
      expect(results.map((item) => item.status).sort((a, b) => a - b)).toEqual([
        200, 200, 201,
      ]);
    });

    it('accepts one active reservation per voucher, also in parallel', async () => {
      const results = await Promise.all([
        book('key-1', { roomTypeCode: 'SUITE' }),
        book('key-2', {
          roomTypeCode: 'DBL',
          checkIn: day(20),
          checkOut: day(21),
        }),
      ]);
      const refused = results.find((item) => item.status === 409);

      expect(results.map((item) => item.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      expect(refused?.body.code).toBe('VOUCHER_ALREADY_USED');
    });

    it.each([
      [{ voucherCode: undefined }, 'VOUCHER_REQUIRED'],
      [{ voucherCode: '' }, 'VOUCHER_REQUIRED'],
      [{ checkIn: '2020-01-01' }, 'INVALID_DATES'],
      [{ guestsCount: 9 }, 'CAPACITY_EXCEEDED'],
      [{ packageServices: [{ quantity: 1 }] }, 'VALIDATION_ERROR'],
      [{ notes: 'x' }, 'VALIDATION_ERROR'],
    ])('rejects %j with %s', async (overrides, code) => {
      const { body } = await book('key-1', overrides).expect(400);

      expect(body.code).toBe(code);
      expect(await prisma.reservation.count()).toBe(4);
    });

    it('requires the Idempotency-Key header', async () => {
      const { body } = await external('post').send(voucherBody()).expect(400);

      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('reads, changes and cancels an own reservation', async () => {
      const { body } = await book('key-1').expect(201);
      const read = await external('get', `/${body.id}`).expect(200);
      const changed = await external('patch', `/${body.id}`)
        .send({ checkOut: day(3) })
        .expect(200);
      const notes = await external('patch', `/${body.id}`)
        .send({ notes: 'x' })
        .expect(400);
      const cancelled = await external('post', `/${body.id}/cancel`).expect(
        200,
      );
      await external('post', `/${body.id}/cancel`).expect(200);

      expect(read.body).toEqual(body);
      expect(changed.body).toMatchObject({ nights: 3, totalPrice: 1350 });
      expect(notes.body.code).toBe('VALIDATION_ERROR');
      expect(cancelled.body.status).toBe('CANCELLED');
    });

    it('UAT-07: hides reservations of other channels (RB-19)', async () => {
      const id = await idOf('R-000001');

      await external('get', `/${id}`).expect(404);
      await external('patch', `/${id}`).send({ guestsCount: 1 }).expect(404);
      await external('post', `/${id}/cancel`).expect(404);
      expect((await stored(id)).status).toBe('CONFIRMED');
    });

    it('gives reservations only to the key of system D', async () => {
      await http().get('/api/v1/external/reservations/x').expect(401);
      await external('post', '', TEST_OTHER_API_KEY)
        .set('Idempotency-Key', 'key-1')
        .send(voucherBody())
        .expect(403);
      await http()
        .get('/api/v1/external/offers')
        .set('X-API-Key', TEST_OTHER_API_KEY)
        .expect(200);
    });
  });
});
