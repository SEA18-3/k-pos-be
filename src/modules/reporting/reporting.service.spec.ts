import { normalizeRange } from './reporting.service';

describe('reporting date range', () => {
  it('uses the merchant calendar date instead of the server UTC date', () => {
    const now = new Date('2026-08-17T17:30:00.000Z');

    const jakarta = normalizeRange(undefined, undefined, 'Asia/Jakarta', now);
    const utc = normalizeRange(undefined, undefined, 'UTC', now);

    expect(jakarta.to.toISOString()).toBe('2026-08-18T00:00:00.000Z');
    expect(utc.to.toISOString()).toBe('2026-08-17T00:00:00.000Z');
  });
});
