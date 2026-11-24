import { createServer, type Server } from 'node:http';

// Atrapa trzech partnerów w jednym serwerze: /a (masaże), /b (treningi), /d (vouchery). (DamianTchorzewski_72206)
// Tryb partnera zmienia POST /control, np. {"partner":"b","mode":"delay"}. (DamianTchorzewski_72206)
export type MockMode = 'ok' | 'refuse' | 'error' | 'delay';
export type MockPartner = 'a' | 'b' | 'd';

export interface MockCall {
  partner: MockPartner;
  method: string;
  path: string;
  body: Record<string, unknown>;
}

const DELAY_MS = 6_000;
const MODES: MockMode[] = ['ok', 'refuse', 'error', 'delay'];

const SERVICES = {
  a: [
    {
      id: 'A-MASSAGE-60',
      name: 'Masaż relaksacyjny',
      description: 'Masaż całego ciała.',
      durationMinutes: 60,
      price: 180,
      currency: 'PLN',
      imageUrl: null,
    },
    {
      id: 'A-MASSAGE-30',
      name: 'Masaż pleców',
      description: 'Krótki masaż pleców.',
      durationMinutes: 30,
      price: 110,
      currency: 'PLN',
      imageUrl: null,
    },
  ],
  b: [
    {
      id: 'B-TRAINING-60',
      name: 'Trening personalny',
      description: 'Trening z instruktorem.',
      durationMinutes: 60,
      price: 150,
      currency: 'PLN',
      imageUrl: null,
    },
  ],
};

// Vouchery testowe z dokumentacji 0.3. (DamianTchorzewski_72206)
const VOUCHERS = new Map([
  ['TEST-C-0001', true],
  ['TEST-C-0002', false],
  ['TEST-C-0003', false],
  ['TEST-C-0004', true],
]);

interface Booking {
  id: string;
  serviceId: string;
  startsAt: number;
  cancelled: boolean;
}

export class PartnerMocks {
  readonly calls: MockCall[] = [];
  // Jednorazowy błąd anulowania, do testu przeniesienia usługi. (DamianTchorzewski_72206)
  failNextCancel = false;
  private readonly modes: Record<MockPartner, MockMode> = {
    a: 'ok',
    b: 'ok',
    d: 'ok',
  };
  private bookings: (Booking & { partner: MockPartner })[] = [];
  private settled = new Map<string, string>();
  private sequence = 0;
  private server: Server | null = null;

  setMode(partner: MockPartner, mode: MockMode): void {
    this.modes[partner] = mode;
  }

  reset(): void {
    this.modes.a = 'ok';
    this.modes.b = 'ok';
    this.modes.d = 'ok';
    this.bookings = [];
    this.settled = new Map();
    this.calls.length = 0;
    this.failNextCancel = false;
  }

  async start(port = 0, host = '127.0.0.1'): Promise<string> {
    this.server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const url = new URL(request.url ?? '/', 'http://mocks');
        const reply = (status: number, body: unknown) => {
          response.writeHead(status, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify(body));
        };

        let body: Record<string, unknown> = {};
        try {
          const text = Buffer.concat(chunks).toString('utf8');
          body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
        } catch {
          reply(400, { message: 'Invalid JSON' });
          return;
        }
        this.route(request.method ?? 'GET', url, body, reply);
      });
    });

    await new Promise<void>((resolve) =>
      this.server?.listen(port, host, resolve),
    );
    const address = this.server.address();
    const actual = typeof address === 'object' && address ? address.port : port;
    return `http://127.0.0.1:${actual}`;
  }

  async stop(): Promise<void> {
    this.server?.closeAllConnections();
    await new Promise((resolve) => this.server?.close(resolve));
  }

  private route(
    method: string,
    url: URL,
    body: Record<string, unknown>,
    reply: (status: number, body: unknown) => void,
  ): void {
    if (url.pathname === '/health') {
      reply(200, { status: 'ok', modes: this.modes });
      return;
    }
    if (method === 'POST' && url.pathname === '/control') {
      const partner = body['partner'] as MockPartner;
      const mode = body['mode'] as MockMode;
      if (!(partner in this.modes) || !MODES.includes(mode)) {
        reply(400, { message: 'Use partner a, b or d and a known mode.' });
        return;
      }
      this.setMode(partner, mode);
      reply(200, { modes: this.modes });
      return;
    }

    const match = /^\/([abd])(\/.*)$/.exec(url.pathname);
    if (!match) {
      reply(404, { message: 'Not found' });
      return;
    }
    const partner = match[1] as MockPartner;
    const path = match[2]!;
    this.calls.push({ partner, method, path, body });

    const mode = this.modes[partner];
    if (mode === 'error') {
      reply(500, { message: 'Simulated failure' });
      return;
    }
    if (mode === 'delay') {
      setTimeout(() => reply(200, {}), DELAY_MS).unref();
      return;
    }
    if (mode === 'refuse' && method === 'POST') {
      reply(409, { message: 'Simulated refusal' });
      return;
    }

    if (partner === 'd') {
      this.vouchers(path, body, reply);
    } else {
      this.servicePartner(partner, method, path, url, body, reply);
    }
  }

  private servicePartner(
    partner: 'a' | 'b',
    method: string,
    path: string,
    url: URL,
    body: Record<string, unknown>,
    reply: (status: number, body: unknown) => void,
  ): void {
    if (method === 'GET' && path === '/services') {
      reply(200, { items: SERVICES[partner] });
      return;
    }
    if (method === 'GET' && path === '/slots') {
      reply(200, { items: this.slots(partner, url.searchParams) });
      return;
    }
    if (method === 'POST' && path === '/bookings') {
      const startsAt = Date.parse(String(body['startsAt']));
      const serviceId = String(body['serviceId']);
      if (
        Number.isNaN(startsAt) ||
        !SERVICES[partner].some((service) => service.id === serviceId)
      ) {
        reply(400, { message: 'Unknown service or invalid time' });
        return;
      }
      if (this.isTaken(partner, startsAt)) {
        reply(409, { message: 'Slot taken' });
        return;
      }
      this.sequence += 1;
      const id = `${partner.toUpperCase()}-${this.sequence}`;
      this.bookings.push({
        partner,
        id,
        serviceId,
        startsAt,
        cancelled: false,
      });
      reply(201, { id, status: 'CONFIRMED' });
      return;
    }

    const cancel = /^\/bookings\/([^/]+)\/cancel$/.exec(path);
    const booking = cancel
      ? this.bookings.find(
          (item) =>
            item.partner === partner &&
            item.id === decodeURIComponent(cancel[1]!),
        )
      : undefined;
    if (method === 'POST' && booking && this.failNextCancel) {
      this.failNextCancel = false;
      reply(500, { message: 'Simulated failure' });
      return;
    }
    if (method === 'POST' && booking) {
      booking.cancelled = true;
      reply(200, { id: booking.id, status: 'CANCELLED' });
      return;
    }
    reply(404, { message: 'Not found' });
  }

  // Wolne godziny 9-17 (UTC) wybranego dnia. (DamianTchorzewski_72206)
  private slots(partner: 'a' | 'b', params: URLSearchParams) {
    const wanted = params.get('serviceId');
    return SERVICES[partner]
      .filter((service) => !wanted || service.id === wanted)
      .flatMap((service) =>
        Array.from({ length: 9 }, (_, index) =>
          Date.parse(
            `${params.get('date')}T${String(9 + index).padStart(2, '0')}:00:00Z`,
          ),
        )
          .filter((time) => !Number.isNaN(time) && !this.isTaken(partner, time))
          .map((time) => ({
            serviceId: service.id,
            startsAt: new Date(time).toISOString(),
          })),
      );
  }

  private isTaken(partner: MockPartner, startsAt: number): boolean {
    return this.bookings.some(
      (item) =>
        item.partner === partner &&
        item.startsAt === startsAt &&
        !item.cancelled,
    );
  }

  private vouchers(
    path: string,
    body: Record<string, unknown>,
    reply: (status: number, body: unknown) => void,
  ): void {
    const code = String(body['voucherCode']);
    const reservation = String(body['hotelReservationNumber']);
    const known = VOUCHERS.get(code);
    const settledFor = this.settled.get(code);

    if (path === '/vouchers/verify') {
      if (known === undefined) {
        reply(404, { message: 'Unknown voucher' });
        return;
      }
      reply(200, { valid: known && settledFor === undefined });
      return;
    }
    if (path === '/vouchers/settle') {
      if (!known || (settledFor !== undefined && settledFor !== reservation)) {
        reply(409, { message: 'The voucher cannot be settled' });
        return;
      }
      this.settled.set(code, reservation);
      reply(200, { settled: true });
      return;
    }
    reply(404, { message: 'Not found' });
  }
}
