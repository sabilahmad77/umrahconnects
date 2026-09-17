import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/modules/mail/mail.service';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
  mails: { to: string; subject: string; text: string }[];
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true, bodyParser: false, logger: ['error'] });
  configureApp(app);
  await app.init();
  // One real listener for the whole file (avoids per-request ephemeral servers and
  // keep-alive races that surface as "socket hang up").
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer();
  server.keepAliveTimeout = 60_000;
  server.headersTimeout = 65_000;
  const base = `http://127.0.0.1:${server.address().port}`;

  const mails: TestContext['mails'] = [];
  const mail = app.get(MailService);
  mail.send = async (m) => {
    mails.push({ to: m.to, subject: m.subject, text: m.text });
    return { delivered: true, driver: 'log' };
  };

  return {
    app,
    prisma: app.get(PrismaService),
    http: () => request(base),
    mails,
    close: () => app.close(),
  };
}

export const api = (path: string) => `/api/v1${path}`;

export function tokenFromMail(text: string): string {
  const m = /token=([A-Za-z0-9_\-%]+)/.exec(text);
  if (!m) throw new Error('no token in mail');
  return decodeURIComponent(m[1]);
}
