import { HttpException, HttpStatus } from '@nestjs/common';

export type SyncErrorCode =
  | 'SYNC_ARITHMETIC_ERROR'
  | 'SYNC_CONSTRAINT_VIOLATION'
  | 'SYNC_ITEM_NOT_FOUND'
  | 'SYNC_ALREADY_EXISTS'
  | 'SYNC_UNKNOWN_ERROR';

export class SyncConflictException extends HttpException {
  constructor(
    public readonly errorCode: SyncErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(
      {
        status: 'error',
        code: errorCode,
        message,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        details: details as any,
      },
      HttpStatus.CONFLICT,
    );
  }
}
