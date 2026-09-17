import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../../src/modules/mail/mail.service';

const smtpHost = process.env.SMTP_TEST_HOST; // e.g. 127.0.0.1
const api = process.env.SMTP_TEST_API; // e.g. http://127.0.0.1:18025

describe.skipIf(!smtpHost || !api)('MailService SMTP driver against Mailpit', () => {
  const config = (extra: Record<string, string>) =>
    new ConfigService({
      NODE_ENV: 'production',
      MAIL_DRIVER: 'smtp',
      SMTP_HOST: smtpHost ?? '',
      SMTP_PORT: process.env.SMTP_TEST_PORT ?? '1025',
      SMTP_SECURE: 'false',
      SMTP_USER: 'noreply@umrahconnect.io',
      SMTP_PASS: 'mailpit-accepts-any',
      MAIL_FROM: 'Umrah Connect <no-reply@umrahconnect.io>',
      ...extra,
    });

  it('delivers a real SMTP message', async () => {
    const subject = `Reset your Umrah Connect password ${Date.now()}`;
    const mail = new MailService(config({}));
    expect(mail.status).toEqual({ driver: 'smtp', configured: true, missing: [] });
    const res = await mail.send({ to: 'pilgrim@example.com', subject, text: 'Open this link: https://umrahconnect.io/reset-password?token=abc' });
    expect(res).toEqual({ delivered: true, driver: 'smtp' });
    const list = await (await fetch(`${api}/api/v1/search?query=${encodeURIComponent(`subject:"${subject}"`)}`)).json();
    expect(list.messages_count).toBe(1);
    expect(list.messages[0].To[0].Address).toBe('pilgrim@example.com');
    expect(list.messages[0].From.Address).toBe('no-reply@umrahconnect.io');
  });

  it('production never uses the log driver and reports missing SMTP settings', async () => {
    // ConfigService reads process.env first, so the production branch needs the real variable.
    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
    expect(new MailService(config({ MAIL_DRIVER: 'log' })).driver).toBe('none');
    const incomplete = new MailService(config({ SMTP_PASS: '' }));
    expect(incomplete.status.configured).toBe(false);
    expect(incomplete.status.missing).toEqual(['SMTP_PASS']);
    const none = new MailService(new ConfigService({ NODE_ENV: 'production' }));
    expect(await none.send({ to: 'x@example.com', subject: 's', text: 't' })).toEqual({ delivered: false, driver: 'none' });
    } finally {
      process.env.NODE_ENV = before;
    }
  });
});
