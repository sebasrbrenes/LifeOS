import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/brand/logo";
import { AccountSummary } from "@/features/auth/components/account-summary";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { NetworkStatus } from "@/features/pwa/components/network-status";
import {
  BottomNav,
  SidebarNav,
} from "@/features/navigation/components/app-nav";

/**
 * Authenticated shell. The chrome is static so it prerenders; anything that
 * reads the session streams in behind Suspense. Pages verify the session
 * themselves (layouts don't re-run on client navigation).
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar px-3 py-5 md:flex">
        <Link
          href="/dashboard"
          className="mb-8 px-3"
          aria-label="Life OS, ir al dashboard"
        >
          <Logo />
        </Link>
        <SidebarNav />
        <div className="mt-auto grid gap-2 border-t pt-4">
          <Suspense fallback={<div className="mx-3 h-4 rounded bg-muted" />}>
            <AccountSummary />
          </Suspense>
          <SignOutButton className="justify-start" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center border-b bg-background/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
          <Link href="/dashboard" aria-label="Life OS, ir al dashboard">
            <Logo />
          </Link>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 md:px-8 md:py-10">
          {children}
        </main>
      </div>

      <BottomNav />
      <NetworkStatus />
    </div>
  );
}
