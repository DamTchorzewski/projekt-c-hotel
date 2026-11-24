import { Injectable } from '@nestjs/common';
import {
  SERVICE_PARTNERS,
  type PartnerOfferDto,
  type PartnerOffersResponseDto,
  type ServicePartnerCode,
} from './dto/partner.dto.js';
import { PartnerRegistry } from './partner-registry.service.js';
import type { PartnerService } from './service-partner.adapter.js';

export const OFFERS_CACHE_MS = 15 * 60 * 1000;
// Po nieudanej próbie portal nie czeka na niedziałającego partnera przy każdym wejściu. (DamianTchorzewski_72206)
export const OFFERS_RETRY_MS = 60 * 1000;

interface CachedOffer {
  items: PartnerService[];
  available: boolean;
  refreshAfter: number;
}

// Oferty A i B dla portalu: pamięć podręczna 15 minut, a przy awarii ostatnia znana oferta (US-07). (DamianTchorzewski_72206)
@Injectable()
export class PartnerOffersService {
  private readonly cache = new Map<ServicePartnerCode, CachedOffer>();
  private readonly pending = new Map<
    ServicePartnerCode,
    Promise<CachedOffer>
  >();

  constructor(private readonly registry: PartnerRegistry) {}

  async findOffers(): Promise<PartnerOffersResponseDto> {
    return {
      partners: await Promise.all(
        SERVICE_PARTNERS.map((partner) => this.offerOf(partner)),
      ),
    };
  }

  private async offerOf(partner: ServicePartnerCode): Promise<PartnerOfferDto> {
    const cached = this.cache.get(partner);
    const offer =
      cached && cached.refreshAfter > Date.now()
        ? cached
        : await this.refresh(partner);

    return { partner, available: offer.available, items: offer.items };
  }

  private refresh(partner: ServicePartnerCode): Promise<CachedOffer> {
    const running = this.pending.get(partner);
    if (running) {
      return running;
    }

    const request = this.load(partner).finally(() =>
      this.pending.delete(partner),
    );
    this.pending.set(partner, request);
    return request;
  }

  private async load(partner: ServicePartnerCode): Promise<CachedOffer> {
    let offer: CachedOffer;
    try {
      offer = {
        items: await this.registry.forCode(partner).getServices(),
        available: true,
        refreshAfter: Date.now() + OFFERS_CACHE_MS,
      };
    } catch {
      offer = {
        items: this.cache.get(partner)?.items ?? [],
        available: false,
        refreshAfter: Date.now() + OFFERS_RETRY_MS,
      };
    }
    this.cache.set(partner, offer);
    return offer;
  }
}
