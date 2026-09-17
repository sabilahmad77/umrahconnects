import type { Request, Response } from 'express';

/**
 * Refresh-token cookie. httpOnly (never readable by page scripts), SameSite=Lax,
 * Secure in production, Path=/ because the browser reaches the API through the
 * web origin's /proxy-api rewrite. `__Host-` prefix in production pins it to the
 * exact host.
 */
export function refreshCookieName(secure: boolean) {
  return secure ? '__Host-uc_rt' : 'uc_rt';
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers?.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function setCookie(res: Response, name: string, value: string, opts: { maxAgeMs: number; secure: boolean }) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: opts.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: opts.maxAgeMs,
  });
}

export function clearCookie(res: Response, name: string, secure: boolean) {
  res.clearCookie(name, { httpOnly: true, secure, sameSite: 'lax', path: '/' });
}
