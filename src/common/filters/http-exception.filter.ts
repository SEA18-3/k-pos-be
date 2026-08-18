import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    // Log unhandled errors
    if (!(exception instanceof HttpException)) {
      console.error('[HttpExceptionFilter] Unhandled exception:', exception);
    }

    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : null;

    let message: string | string[] = 'Internal server error';
    let code: string | undefined;

    if (exceptionResponse) {
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const obj = exceptionResponse as Record<string, unknown>;
        if ('message' in obj) {
          message = obj.message as string | string[];
        }
        if ('code' in obj) {
          code = obj.code as string;
        }
      }
    }

    response.status(status).json({
      status: 'error',
      message,
      data: null,
      error: {
        code: code ?? `HTTP_${status}`,
        details: Array.isArray(message) ? message : [message],
        request_id: randomUUID(),
        path: request.url,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
