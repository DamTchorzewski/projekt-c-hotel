import { ApiException } from '../errors/api-exception.js';
import { assertStayDates } from './stay-rules.js';

function detailsOf(checkIn: string, checkOut: string): string[] {
  try {
    assertStayDates(checkIn, checkOut, '2026-11-24');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiException);
    expect((error as ApiException).code).toBe('INVALID_DATES');
    expect((error as ApiException).getStatus()).toBe(400);
    return (error as ApiException).details.map((detail) => detail.field);
  }
  return [];
}

describe('assertStayDates (RB-02)', () => {
  it('accepts a stay that starts today and one that lasts 30 nights', () => {
    expect(detailsOf('2026-11-24', '2026-11-25')).toEqual([]);
    expect(detailsOf('2026-11-24', '2026-12-24')).toEqual([]);
  });

  it('rejects an arrival in the past', () => {
    expect(detailsOf('2026-11-23', '2026-11-25')).toEqual(['checkIn']);
  });

  it('rejects a departure that is not later than the arrival', () => {
    expect(detailsOf('2026-11-25', '2026-11-25')).toEqual(['checkOut']);
    expect(detailsOf('2026-11-26', '2026-11-25')).toEqual(['checkOut']);
  });

  it('rejects a stay longer than 30 nights', () => {
    expect(detailsOf('2026-11-24', '2026-12-25')).toEqual(['checkOut']);
  });

  it('reports every problem at once', () => {
    expect(detailsOf('2026-11-20', '2026-11-19')).toEqual([
      'checkIn',
      'checkOut',
    ]);
  });
});
