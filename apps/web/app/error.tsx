'use client';
import Link from 'next/link';
import { Button, ErrorState } from '@/components/ui/system';
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <main className="mx-auto max-w-2xl space-y-4 p-6"><h1 className="text-2xl font-semibold">This page could not load</h1><ErrorState onRetry={reset} /><Link href="/help" className="inline-flex min-h-11 items-center text-brand-700">Contact support</Link></main>; }
