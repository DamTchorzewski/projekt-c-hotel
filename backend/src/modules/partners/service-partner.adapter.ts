import type { Partner } from '../../generated/prisma/client.js';
import {
  PartnerUnavailableError,
  type PartnerClient,
} from './partner-client.service.js';

export interface PartnerService {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  currency: string;
  imageUrl: string | null;
}

export interface PartnerSlot {
  serviceId: string;
  startsAt: string;
}

export interface BookServiceRequest {
  reservationId: string;
  // Pozycja planu i termin: partner może po nich rozpoznać powtórzone żądanie. (DamianTchorzewski_72206)
  reference: string;
  serviceId: string;
  startsAt: string;
  hotelReservationNumber: string;
  voucherCode: string | null;
  guest: { firstName: string; lastName: string; email: string; phone: string };
}

export type BookServiceResult =
  | { outcome: 'confirmed'; externalBookingId: string }
  | { outcome: 'refused' }
  | { outcome: 'error' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function itemsOf(body: unknown): unknown[] {
  const items = isRecord(body) ? body['items'] : undefined;
  if (!Array.isArray(items)) {
    throw new PartnerUnavailableError('Unexpected partner response.');
  }
  return items;
}

function toService(item: unknown): PartnerService {
  if (
    !isRecord(item) ||
    typeof item['id'] !== 'string' ||
    typeof item['name'] !== 'string' ||
    !Number.isInteger(item['durationMinutes']) ||
    (item['durationMinutes'] as number) <= 0 ||
    (item['durationMinutes'] as number) > 24 * 60 ||
    typeof item['price'] !== 'number' ||
    !Number.isFinite(item['price']) ||
    item['price'] < 0
  ) {
    throw new PartnerUnavailableError('Unexpected partner service format.');
  }

  return {
    id: item['id'],
    name: item['name'],
    description:
      typeof item['description'] === 'string' ? item['description'] : '',
    durationMinutes: item['durationMinutes'] as number,
    price: item['price'],
    currency: typeof item['currency'] === 'string' ? item['currency'] : 'PLN',
    imageUrl: typeof item['imageUrl'] === 'string' ? item['imageUrl'] : null,
  };
}

function toSlot(item: unknown): PartnerSlot {
  if (
    !isRecord(item) ||
    typeof item['serviceId'] !== 'string' ||
    typeof item['startsAt'] !== 'string' ||
    Number.isNaN(Date.parse(item['startsAt']))
  ) {
    throw new PartnerUnavailableError('Unexpected partner slot format.');
  }
  return { serviceId: item['serviceId'], startsAt: item['startsAt'] };
}

// Wspólna obsługa partnerów A i B, bo ich usługi mają ten sam roboczy kontrakt (DEC-06). (DamianTchorzewski_72206)
export class ServicePartnerAdapter {
  constructor(
    private readonly client: PartnerClient,
    private readonly partner: Extract<Partner, 'A' | 'B'>,
  ) {}

  async getServices(reservationId?: string): Promise<PartnerService[]> {
    const response = await this.client.send(this.partner, {
      method: 'GET',
      endpoint: '/services',
      path: '/services',
      reservationId,
    });
    this.requireOk(response.status);
    return itemsOf(response.body).map(toService);
  }

  async getSlots(date: string, serviceId?: string): Promise<PartnerSlot[]> {
    const query = new URLSearchParams({
      date,
      ...(serviceId ? { serviceId } : {}),
    });
    const response = await this.client.send(this.partner, {
      method: 'GET',
      endpoint: '/slots',
      path: `/slots?${query.toString()}`,
    });
    this.requireOk(response.status);
    return itemsOf(response.body).map(toSlot);
  }

  async book(request: BookServiceRequest): Promise<BookServiceResult> {
    const { reservationId, ...body } = request;
    const response = await this.client.send(this.partner, {
      method: 'POST',
      endpoint: '/bookings',
      path: '/bookings',
      body,
      reservationId,
    });

    if (response.status === 409) {
      return { outcome: 'refused' };
    }
    const id = isRecord(response.body) ? response.body['id'] : undefined;
    if (response.status < 300 && typeof id === 'string' && id !== '') {
      return { outcome: 'confirmed', externalBookingId: id };
    }
    return { outcome: 'error' };
  }

  // Rezerwacja, której partner już nie zna, jest z naszego punktu widzenia anulowana. (DamianTchorzewski_72206)
  async cancel(
    externalBookingId: string,
    reservationId: string,
  ): Promise<boolean> {
    const response = await this.client.send(this.partner, {
      method: 'POST',
      endpoint: '/bookings/{id}/cancel',
      path: `/bookings/${encodeURIComponent(externalBookingId)}/cancel`,
      reservationId,
    });
    return response.status < 300 || response.status === 404;
  }

  private requireOk(status: number): void {
    if (status >= 300) {
      throw new PartnerUnavailableError(`Unexpected HTTP ${status}`);
    }
  }
}
