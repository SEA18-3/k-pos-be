import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    // Log unexpected errors (non-HttpException) untuk debugging
    if (!(exception instanceof HttpException)) {
      console.error('[HttpExceptionFilter] Unhandled exception:', exception);
    }

    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : null;

    let message: string | string[] = 'Internal server error';
    let code = 'INTERNAL_ERROR';
    let details: unknown;
    if (exceptionResponse) {
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && 'message' in exceptionResponse) {
        const errorBody = exceptionResponse as Record<string, unknown>;
        message = errorBody.message as string | string[];
        if (typeof errorBody.code === 'string') code = errorBody.code;
        details = errorBody.details;
      }
    }

    if (code === 'INTERNAL_ERROR' && exception instanceof HttpException) {
      code = exception.name
        .replace(/Exception$/, '')
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .toUpperCase();
    }

    const requestId = request.headers['x-request-id']?.toString() ?? randomUUID();

    response.status(status).json({
      status: 'error',
      message,
      error: {
        code,
        ...(details === undefined ? {} : { details }),
        request_id: requestId,
      },
    });
  }
}
