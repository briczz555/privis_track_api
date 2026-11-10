import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

const ERROR_CODES: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  422: 'validation_error',
  429: 'rate_limited',
  500: 'internal_error',
};

type RequestWithId = Request & { requestId?: string };

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<RequestWithId>();

    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    let message = 'Terjadi kesalahan pada server.';
    let details: unknown;

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const payload = body as Record<string, unknown>;
        if (typeof payload.message === 'string') {
          message = payload.message;
        } else if (Array.isArray(payload.message)) {
          message = 'Validasi gagal.';
          details = { fields: payload.message };
        }
        if (payload.details) details = payload.details;
      }
    } else {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const requestId =
      request.requestId ?? request.header('x-request-id') ?? randomUUID();

    response.setHeader('X-Request-Id', requestId);
    response.status(status).json({
      error: {
        code: ERROR_CODES[status] ?? 'internal_error',
        message,
        ...(details ? { details } : {}),
        request_id: requestId,
      },
    });
  }
}
