import type { PaymentStatus, ReconciliationStatus } from '../../../generated/prisma/client';

export type ReconciliationResolution = 'VALID' | 'INVALID';

export function paymentResolution(
  currentPayment: PaymentStatus,
  resolution: ReconciliationResolution,
): { paymentStatus: PaymentStatus; reconciliationStatus: ReconciliationStatus } {
  if (currentPayment !== 'VERIFIED') {
    throw new Error('Only VERIFIED payments can be reconciled');
  }
  return resolution === 'VALID'
    ? { paymentStatus: 'VERIFIED', reconciliationStatus: 'RESOLVED_VALID' }
    : { paymentStatus: 'FAILED', reconciliationStatus: 'RESOLVED_INVALID' };
}
