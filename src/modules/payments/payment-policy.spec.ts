import { paymentResolution } from './payment-policy';

describe('payment reconciliation policy', () => {
  it('keeps a valid exception verified', () => {
    expect(paymentResolution('VERIFIED', 'VALID')).toEqual({
      paymentStatus: 'VERIFIED',
      reconciliationStatus: 'RESOLVED_VALID',
    });
  });

  it('marks an invalid exception failed', () => {
    expect(paymentResolution('VERIFIED', 'INVALID')).toEqual({
      paymentStatus: 'FAILED',
      reconciliationStatus: 'RESOLVED_INVALID',
    });
  });

  it('does not reopen an already failed payment', () => {
    expect(() => paymentResolution('FAILED', 'VALID')).toThrow(
      'Only VERIFIED payments can be reconciled',
    );
  });
});
