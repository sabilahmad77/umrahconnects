import Link from 'next/link';
import { PublicShell } from '@/components/public/public-chrome';
export default function NotFound() { return <PublicShell><section className="mx-auto max-w-2xl px-4 py-20"><p className="text-sm text-gray-600">Page not found</p><h1 className="mt-3 text-3xl font-semibold text-brand-600">We couldn’t find that page.</h1><p className="mt-4 text-gray-600">The link may have changed, or the record may be unavailable.</p><Link href="/" className="uc-button uc-button-primary mt-6">Return home</Link></section></PublicShell>; }
