import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  status: string;
  message: string;
  data: T;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data: T | { message?: string; data?: T }) => {
        if (data && typeof data === 'object' && 'message' in data && 'data' in data) {
          return {
            status: 'success',
            message: String(data.message ?? 'OK'),
            data: data.data as T,
          };
        }

        return { status: 'success', message: 'OK', data: data as T };
      }),
    );
  }
}
