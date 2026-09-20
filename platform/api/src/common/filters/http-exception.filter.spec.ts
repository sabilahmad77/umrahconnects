import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { describe, expect, it } from 'vitest';
import { HttpExceptionFilter } from './http-exception.filter';

/** Runs the filter against a fake HTTP context and returns the status and envelope it sent. */
function render(exception: unknown) {
  const sent: { status?: number; body?: any } = {};
  const response = {
    headersSent: false,
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: unknown) {
      sent.body = body;
      return this;
    },
  };
  const request = { method: 'POST', path: '/api/v1/auth/verify-email/request', headers: { 'x-request-id': 'req-12345678' } };
  const host = { switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }) } as unknown as ArgumentsHost;
  new HttpExceptionFilter().catch(exception, host);
  return sent;
}

describe('HttpExceptionFilter — 429 (F5)', () => {
  it('replaces only the rate limiter message with the generic one', () => {
    const { status, body } = render(new ThrottlerException());
    expect(status).toBe(429);
    expect(body.error).toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests. Please slow down and try again shortly.',
      requestId: 'req-12345678',
    });
    expect(JSON.stringify(body)).not.toContain('ThrottlerException');
  });

  it('keeps the code, message and retry details of a deliberate 429 such as VERIFICATION_COOLDOWN', () => {
    const cooldown = new HttpException(
      {
        code: 'VERIFICATION_COOLDOWN',
        message: 'A verification email was sent recently. You can request another in 42 seconds.',
        details: { retryAfterSeconds: 42 },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
    const { status, body } = render(cooldown);
    expect(status).toBe(429);
    expect(body.error).toMatchObject({
      code: 'VERIFICATION_COOLDOWN',
      message: 'A verification email was sent recently. You can request another in 42 seconds.',
      details: { retryAfterSeconds: 42 },
    });
  });

  it('a plain 429 without a body of its own keeps its message and the standard code', () => {
    const { body } = render(new HttpException('Slow down: 3 uploads per minute', HttpStatus.TOO_MANY_REQUESTS));
    expect(body.error).toMatchObject({ code: 'TOO_MANY_REQUESTS', message: 'Slow down: 3 uploads per minute' });
  });
});
