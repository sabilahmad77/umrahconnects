export function safeReturnPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value)) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith('//') || /[\\\u0000-\u001f]/.test(decoded)) return null;
    const path = new URL(value, 'https://umrah.local');
    if (path.origin !== 'https://umrah.local' || ['/login', '/signup', '/reset-password', '/auth/callback', '/verify-email'].includes(path.pathname)) return null;
    return value;
  } catch { return null; }
}
