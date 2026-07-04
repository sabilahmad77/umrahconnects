import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(
  amountMinorUnits: number | bigint,
  currency: string = 'SAR',
  locale: string = 'en-SA',
): string {
  const amount = typeof amountMinorUnits === 'bigint'
    ? Number(amountMinorUnits) / 100
    : amountMinorUnits / 100;
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}

export function formatDate(date: string | Date, locale: string = 'en-SA'): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(date));
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export const COUNTRY_FLAGS: Record<string, string> = {
  SA: '🇸🇦', ID: '🇮🇩', PK: '🇵🇰', MY: '🇲🇾', TR: '🇹🇷',
  NG: '🇳🇬', EG: '🇪🇬', GB: '🇬🇧', US: '🇺🇸', AE: '🇦🇪',
  QA: '🇶🇦', KW: '🇰🇼', BH: '🇧🇭', OM: '🇴🇲', BD: '🇧🇩',
};
