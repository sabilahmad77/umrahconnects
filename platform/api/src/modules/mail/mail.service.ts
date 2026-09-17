import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export type MailDriver = 'smtp' | 'log' | 'none';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Outbound email behind one seam.
 *  - `smtp`: real delivery (Hostinger mail, SES SMTP, SendGrid SMTP …).
 *  - `log`:  development only — writes the message to the log. Refused in production.
 *  - `none`: no delivery; callers get `delivered: false` and must not claim success.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    if (this.driver === 'smtp' && this.missing().length === 0) {
      this.transporter = nodemailer.createTransport({
        host: this.config.get<string>('SMTP_HOST'),
        port: Number(this.config.get<string>('SMTP_PORT', '587')),
        secure: this.config.get<string>('SMTP_SECURE', 'false') === 'true',
        auth: { user: this.config.get<string>('SMTP_USER'), pass: this.config.get<string>('SMTP_PASS') },
      });
    }
  }

  private get isProduction() {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  get driver(): MailDriver {
    const configured = this.config.get<string>('MAIL_DRIVER');
    if (configured === 'smtp' || configured === 'none') return configured;
    if (configured === 'log') return this.isProduction ? 'none' : 'log';
    return this.isProduction ? 'none' : 'log';
  }

  missing(): string[] {
    if (this.driver !== 'smtp') return [];
    return ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'].filter((k) => !this.config.get(k));
  }

  get status() {
    return { driver: this.driver, configured: this.driver !== 'none' && this.missing().length === 0, missing: this.missing() };
  }

  get canDeliver(): boolean {
    return this.status.configured;
  }

  /** Returns whether the message was handed to a real or development transport. Never throws for `none`. */
  async send(message: MailMessage): Promise<{ delivered: boolean; driver: MailDriver }> {
    const driver = this.driver;
    if (driver === 'none') {
      this.logger.warn(`Mail not sent (MAIL_DRIVER=none): "${message.subject}"`);
      return { delivered: false, driver };
    }
    if (driver === 'log') {
      // Development transport: the body may contain one-time links, which is acceptable only outside production.
      this.logger.log(`[dev-mail] to=${message.to} subject="${message.subject}"\n${message.text}`);
      return { delivered: true, driver };
    }
    if (!this.transporter) {
      throw new ServiceUnavailableException(`Mail is not configured. Missing: ${this.missing().join(', ')}`);
    }
    await this.transporter.sendMail({
      from: this.config.get<string>('MAIL_FROM'),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    this.logger.log(`Mail delivered via SMTP: "${message.subject}"`);
    return { delivered: true, driver };
  }
}
