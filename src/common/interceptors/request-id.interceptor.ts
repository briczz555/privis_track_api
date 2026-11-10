import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Observable } from 'rxjs';
import type { Request, Response } from 'express';

type RequestWithId = Request & { requestId?: string };

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();

    const requestId = (request.header('x-request-id') ?? randomUUID()).slice(
      0,
      100,
    );
    request.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);

    return next.handle();
  }
}
