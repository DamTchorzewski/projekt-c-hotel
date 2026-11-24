import { Injectable } from '@nestjs/common';
import {
  PartnerClient,
  PartnerUnavailableError,
} from './partner-client.service.js';

export interface VoucherRequest {
  reservationId: string;
  voucherCode: string;
  hotelReservationNumber: string;
}

// System D: weryfikacja i rozliczanie voucherów. (DamianTchorzewski_72206)
@Injectable()
export class PartnerDAdapter {
  constructor(private readonly client: PartnerClient) {}

  verify(request: VoucherRequest): Promise<boolean> {
    return this.ask('/vouchers/verify', request, 'valid');
  }

  // Potwierdzenie jest idempotentne po stronie D dla tego samego numeru rezerwacji. (DamianTchorzewski_72206)
  settle(request: VoucherRequest): Promise<boolean> {
    return this.ask('/vouchers/settle', request, 'settled');
  }

  // Zwraca true albo false tylko dla jednoznacznej odpowiedzi D, w pozostałych przypadkach D jest niedostępny. (DamianTchorzewski_72206)
  private async ask(
    endpoint: string,
    { reservationId, voucherCode, hotelReservationNumber }: VoucherRequest,
    field: 'valid' | 'settled',
  ): Promise<boolean> {
    const response = await this.client.send('D', {
      method: 'POST',
      endpoint,
      path: endpoint,
      body: { voucherCode, hotelReservationNumber },
      reservationId,
    });

    if ([404, 409, 422].includes(response.status)) {
      return false;
    }
    const answer =
      response.status < 300 &&
      typeof response.body === 'object' &&
      response.body !== null
        ? (response.body as Record<string, unknown>)[field]
        : undefined;
    if (typeof answer !== 'boolean') {
      throw new PartnerUnavailableError('Unexpected partner response.');
    }
    return answer;
  }
}
