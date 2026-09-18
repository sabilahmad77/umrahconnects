/**
 * Account emails (verification and password reset) in the recipient's saved
 * language and time zone — the server-side half of the user preferences in
 * `modules/preferences`. The web interface itself is English-only for now, so
 * email is the one place the language preference changes what a person sees.
 */

export const EMAIL_LOCALES = ['en', 'ar'] as const;
export type EmailLocale = (typeof EMAIL_LOCALES)[number];

export const DEFAULT_TIME_ZONE = 'Asia/Riyadh';

export function emailLocale(value: string | null | undefined): EmailLocale {
  return typeof value === 'string' && value.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

/** True when the runtime knows this IANA time zone. */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 50) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** "19 Sep 2026, 15:45 (Asia/Riyadh)" in the person's language and zone; Gregorian calendar in both languages. */
export function formatInZone(date: Date, locale: EmailLocale, timeZone: string | null | undefined): string {
  const zone = isTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  const formatted = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: zone,
  }).format(date);
  return `${formatted} (${zone})`;
}

interface Recipient {
  locale?: string | null;
  timezone?: string | null;
}

export function verificationEmail(user: Recipient, link: string, expiresAt: Date) {
  const locale = emailLocale(user.locale);
  const until = formatInZone(expiresAt, locale, user.timezone);
  if (locale === 'ar') {
    return {
      subject: 'تأكيد بريدك الإلكتروني في Umrah Connect',
      text:
        `مرحبًا بك في Umrah Connect.\n\n` +
        `يُرجى تأكيد عنوان بريدك الإلكتروني خلال 24 ساعة (قبل ${until}):\n${link}\n\n` +
        `إذا لم تنشئ حسابًا لدينا، يمكنك تجاهل هذه الرسالة.\n`,
    };
  }
  return {
    subject: 'Confirm your Umrah Connect email',
    text:
      `Welcome to Umrah Connect.\n\n` +
      `Confirm your email address within 24 hours (by ${until}):\n${link}\n\n` +
      `If you did not create an account, you can ignore this email.\n`,
  };
}

export function passwordResetEmail(user: Recipient & { hasPassword: boolean }, organization: string, link: string, expiresAt: Date) {
  const locale = emailLocale(user.locale);
  const until = formatInZone(expiresAt, locale, user.timezone);
  if (locale === 'ar') {
    return {
      subject: user.hasPassword ? 'إعادة تعيين كلمة المرور في Umrah Connect' : 'تعيين كلمة مرور لحسابك في Umrah Connect',
      text:
        (user.hasPassword
          ? `طُلبت إعادة تعيين كلمة المرور لحسابك في ${organization}.\n\n`
          : `طُلب تعيين كلمة مرور لحسابك في ${organization}، والذي تسجّل الدخول إليه حاليًا عبر Google.\n\n`) +
        `افتح هذا الرابط خلال 30 دقيقة (قبل ${until}) لاختيار كلمة مرور جديدة:\n${link}\n\n` +
        `إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة.`,
    };
  }
  return {
    subject: user.hasPassword ? 'Reset your Umrah Connect password' : 'Set a password for your Umrah Connect account',
    text:
      (user.hasPassword
        ? `A password reset was requested for your ${organization} account.\n\n`
        : `A password was requested for your ${organization} account, which currently signs in with Google.\n\n`) +
      `Open this link within 30 minutes (by ${until}) to choose a new password:\n${link}\n\n` +
      `If you did not request this, you can ignore this email.`,
  };
}
