import Link from 'next/link';
import { Alert } from '@/components/ui/system';
import type { DeniedReason } from '@/lib/workspace-access';

const COPY: Record<DeniedReason, { title: string; body: string }> = {
  'platform-only': {
    title: 'Platform administration only',
    body: 'This page belongs to the Umrah Connect platform console. Your account works inside its own organization, so it is not available here.',
  },
  'organization-only': {
    title: 'Organization workspace page',
    body: 'This page is part of an organization workspace. Platform accounts manage organizations from the platform console instead.',
  },
  audience: {
    title: 'Traveler page',
    body: 'This page shows a traveler’s own journey, so it is not part of your workspace.',
  },
  permission: {
    title: 'Permission required',
    body: 'Your account does not have the permission this page needs. Your organization administrator can grant it; the tools you can use are listed in the menu.',
  },
  unknown: {
    title: 'Page unavailable',
    body: 'This page is not part of your workspace. Check the link, or use the menu.',
  },
};

/**
 * Shown in place of a page the account may not open (direct navigation,
 * an old bookmark, or a grant withdrawn while the page was open). The API
 * refuses the same data independently; this only explains it.
 */
export function AccessDenied({ reason, homeHref }: { reason: DeniedReason; homeHref: string }) {
  const copy = COPY[reason];
  return (
    <section data-access="denied" aria-labelledby="access-denied-title" className="mx-auto max-w-2xl space-y-4">
      <h1 id="access-denied-title" className="text-2xl font-semibold">
        Workspace access required
      </h1>
      <Alert title={copy.title}>{copy.body}</Alert>
      <Link href={homeHref} className="uc-button uc-button-secondary">
        Return to your workspace
      </Link>
    </section>
  );
}
