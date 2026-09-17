import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';

// Standard error envelope for all API responses
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string | string[];
    details?: unknown;
    requestId: string;
    timestamp: string;
  };
}

/**
 * Converts every failure into the standard envelope. Internal details (stack
 * traces, SQL, Prisma messages) are logged server-side only; clients receive a
 * stable code, a safe message and the request id for correlation.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as any).requestId ?? (request.headers['x-request-id'] as string) ?? randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let code = 'INTERNAL_ERROR';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = this.statusToCode(status);
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (res && typeof res === 'object') {
        const r = res as Record<string, any>;
        message = r.message ?? message;
        if (typeof r.code === 'string') code = r.code;
        details = r.errors ?? r.details ?? (r.tenants ? { tenants: r.tenants } : undefined);
      }
      if (status === 429) message = 'Too many requests. Please slow down and try again shortly.';
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      ({ status, code, message } = this.fromPrisma(exception));
      if (status >= 500) this.logger.error(`[${requestId}] Prisma ${exception.code}: ${exception.message}`);
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      code = 'BAD_REQUEST';
      message = 'Request contains invalid values';
      this.logger.warn(`[${requestId}] Prisma validation error on ${request.method} ${request.path}`);
    } else if (exception instanceof Error) {
      this.logger.error(`[${requestId}] Unhandled exception on ${request.method} ${request.path}: ${exception.message}`, exception.stack);
    }

    const body: ErrorResponse = {
      success: false,
      error: { code, message, details, requestId, timestamp: new Date().toISOString() },
    };
    if (!response.headersSent) response.status(status).json(body);
  }

  private fromPrisma(e: Prisma.PrismaClientKnownRequestError) {
    switch (e.code) {
      case 'P2025':
        return { status: 404, code: 'NOT_FOUND', message: 'Record not found' };
      case 'P2002':
        return { status: 409, code: 'CONFLICT', message: 'A record with these values already exists' };
      case 'P2003':
        return { status: 400, code: 'BAD_REQUEST', message: 'A referenced record does not exist' };
      case 'P2000':
      case 'P2006':
      case 'P2007':
      case 'P2023':
        return { status: 400, code: 'BAD_REQUEST', message: 'Request contains invalid values' };
      default:
        return { status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' };
    }
  }

  private statusToCode(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      402: 'PAYMENT_REQUIRED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      413: 'PAYLOAD_TOO_LARGE',
      415: 'UNSUPPORTED_MEDIA_TYPE',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_ERROR',
      503: 'SERVICE_UNAVAILABLE',
    };
    return map[status] ?? 'ERROR';
  }
}
