import { Prisma } from '../../generated/prisma/client.js';

type MoneyInput = Prisma.Decimal | number | string;

// Kwoty liczymy na liczbach dziesiętnych, bo zwykłe liczby zmiennoprzecinkowe dają błędy (np. 0.1 + 0.2). (DamianTchorzewski_72206)
export function toMoney(value: MoneyInput): number {
  return new Prisma.Decimal(value).toDecimalPlaces(2).toNumber();
}

// RB-04: koszt pobytu to liczba nocy razy cena za noc typu pokoju. (DamianTchorzewski_72206)
export function calculateTotalPrice(
  pricePerNight: MoneyInput,
  nights: number,
): number {
  return toMoney(new Prisma.Decimal(pricePerNight).mul(nights));
}
