import { calculateTotalPrice, toMoney } from './stay-pricing.js';

describe('stay pricing (RB-04)', () => {
  it('multiplies the nightly price by the number of nights', () => {
    expect(calculateTotalPrice('250.00', 3)).toBe(750);
    expect(calculateTotalPrice(450, 3)).toBe(1350);
  });

  it('does not lose grosze to floating point errors', () => {
    expect(calculateTotalPrice('0.10', 3)).toBe(0.3);
    expect(calculateTotalPrice('199.99', 7)).toBe(1399.93);
  });

  it('rounds money to two decimal places', () => {
    expect(toMoney('10.005')).toBe(10.01);
  });
});
