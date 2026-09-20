'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/providers/auth-provider';
import { Alert, Drawer, LoadingState } from '@/components/ui/system';
import { AccessDenied } from '@/components/auth/access-denied';
import { CapabilitySync } from '@/components/auth/capability-sync';
import {
  deniedReason,
  isPendingOrganization,
  landingPathFor,
  normalizePath,
  routeDecision,
} from '@/lib/workspace-access';
import { EmailVerificationNotice } from './email-verification';
import { Sidebar } from './sidebar';
import { Header } from './header';

const NavigationContext = createContext({ openNavigation: () => {} });
export const useWorkspaceNavigation = () => useContext(NavigationContext);

/**
 * Frame of every signed-in page: sidebar, header and the page itself — or,
 * when the account may not open the page, the denied state instead.
 *
 * Access is decided by lib/workspace-access.ts from the capabilities of the
 * current profile. Until that profile has loaded nothing of the workspace is
 * rendered, so no privileged menu or page flashes into view. The profile is
 * kept current by <CapabilitySync />.
 */
export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useAuthContext();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const decision = user ? routeDecision(user, pathname) : null;
  const redirectTo = decision?.kind === 'redirect' ? decision.to : null;

  // A callback ref, not a plain one: the main element only mounts once the
  // profile has loaded, which is after the first effects have run.
  const [mainElement, setMainElement] = useState<HTMLElement | null>(null);

  useEffect(() => setNavigationOpen(false), [pathname]);
  // A page whose content is only figures and text (the reports screens for some
  // roles) still has to be scrollable from the keyboard. The main region is
  // always focusable for the skip link; when it scrolls and holds nothing else
  // to focus, it also takes a tab stop of its own (WCAG 2.1.1).
  useEffect(() => {
    const main = mainElement;
    if (!main) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const scrolls = main.scrollHeight > main.clientHeight + 1;
      const focusable = main.querySelector('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
      main.tabIndex = scrolls && !focusable ? 0 : -1;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    const resize = new ResizeObserver(schedule);
    resize.observe(main);
    const mutations = new MutationObserver(schedule);
    mutations.observe(main, { childList: true, subtree: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
    };
  }, [mainElement, pathname]);
  useEffect(() => {
    // Replace, not push: the page that was refused should not sit in history.
    if (redirectTo && redirectTo !== normalizePath(pathname)) router.replace(redirectTo);
  }, [redirectTo, pathname, router]);

  if (!isLoaded || !user || !decision) {
    return (
      <main className="min-h-dvh bg-ivory">
        <LoadingState label={isLoaded ? 'Opening sign in…' : 'Checking your session…'} />
      </main>
    );
  }

  const path = normalizePath(pathname);
  const pending = isPendingOrganization(user);
  let content: React.ReactNode;
  if (decision.kind === 'allow') {
    content = (
      <>
        {/* The onboarding page carries its own email-verification gate. */}
        {path !== '/onboarding' && <EmailVerificationNotice />}
        {pending && path !== '/onboarding' && (
          <div className="mb-6">
            <Alert tone="info" title="Organization verification in progress">
              Your organization’s tools open once the platform approves its verification.{' '}
              <Link href="/onboarding" className="font-semibold underline">
                Check verification status
              </Link>
            </Alert>
          </div>
        )}
        {children}
      </>
    );
  } else if (decision.kind === 'redirect') {
    content = <LoadingState label="Opening your workspace…" />;
  } else {
    content = <AccessDenied reason={deniedReason(user, pathname)} homeHref={landingPathFor(user)} />;
  }

  return (
    <NavigationContext.Provider value={{ openNavigation: () => setNavigationOpen(true) }}>
      <CapabilitySync />
      <div className="workspace-shell flex h-dvh min-h-0 overflow-hidden bg-[#F4F6F3]">
        <a href="#workspace-main" className="skip-link">
          Skip to content
        </a>
        <div className="hidden lg:flex">
          <Sidebar />
        </div>
        <Drawer open={navigationOpen} onOpenChange={setNavigationOpen} title="Workspace navigation">
          <Sidebar mobile />
        </Drawer>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header />
          <main
            id="workspace-main"
            ref={setMainElement}
            tabIndex={-1}
            className="workspace-main flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-7"
          >
            {content}
          </main>
        </div>
      </div>
    </NavigationContext.Provider>
  );
}
