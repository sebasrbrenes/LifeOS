"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { cn } from "@/lib/utils";

import { NAV_ITEMS, isNavItemActive } from "../nav-items";

function SidebarLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Principal" className="grid gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon, also }) => {
        const active =
          pathname !== null && isNavItemActive(pathname, href, also);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
              active && "bg-sidebar-accent text-foreground",
            )}
          >
            <Icon
              aria-hidden="true"
              className={cn("size-4", active && "text-primary")}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function BottomLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-md">
        {NAV_ITEMS.filter((item) => !item.desktopOnly).map(
          ({ href, label, icon: Icon, also }) => {
            const active =
              pathname !== null && isNavItemActive(pathname, href, also);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-[0.68rem] font-medium text-muted-foreground",
                    active && "text-foreground",
                  )}
                >
                  <Icon
                    aria-hidden="true"
                    className={cn("size-5", active && "text-primary")}
                  />
                  {label}
                </Link>
              </li>
            );
          },
        )}
      </ul>
    </nav>
  );
}

function ActiveSidebarLinks() {
  return <SidebarLinks pathname={usePathname()} />;
}

function ActiveBottomLinks() {
  return <BottomLinks pathname={usePathname()} />;
}

// The current path is request data on dynamic routes (e.g. /metrics/[id]),
// so the active highlight streams in; the links themselves prerender.

/** Vertical navigation for the desktop sidebar. */
export function SidebarNav() {
  return (
    <Suspense fallback={<SidebarLinks pathname={null} />}>
      <ActiveSidebarLinks />
    </Suspense>
  );
}

/** Thumb-reachable tab bar for phones; respects the iPhone home indicator. */
export function BottomNav() {
  return (
    <Suspense fallback={<BottomLinks pathname={null} />}>
      <ActiveBottomLinks />
    </Suspense>
  );
}
