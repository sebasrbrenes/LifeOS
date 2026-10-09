import {
  ActivityIcon,
  CalendarCheckIcon,
  GaugeIcon,
  HistoryIcon,
  PlugIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Other route prefixes that belong to this section. */
  also?: readonly string[];
  /** Hidden from the phone tab bar (reachable from Ajustes). */
  desktopOnly?: boolean;
};

/**
 * Primary navigation. Only routes that exist and work are listed; each
 * phase adds its page here when it ships (see docs/ROADMAP.md).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  {
    href: "/week",
    label: "Semana",
    icon: CalendarCheckIcon,
    also: ["/review"],
  },
  { href: "/score", label: "Score", icon: GaugeIcon },
  { href: "/history", label: "Historial", icon: HistoryIcon },
  { href: "/metrics", label: "Métricas", icon: ActivityIcon },
  {
    href: "/integrations",
    label: "Integraciones",
    icon: PlugIcon,
    desktopOnly: true,
  },
  { href: "/settings", label: "Ajustes", icon: SettingsIcon },
];

function matches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isNavItemActive(
  pathname: string,
  href: string,
  also: readonly string[] = [],
): boolean {
  return [href, ...also].some((prefix) => matches(pathname, prefix));
}
