"use client";

import { useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  BookOpen,
  Database,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
  TrendingUp,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Link, useNavigate } from "react-router";
import { useAuthStore } from "@/stores/auth-store";
import { HelpDialog } from "../HelpDialog";
import { MindGuideLogo } from "../MindGuideLogo";
import { NotificationDrawer } from "../NotificationDrawer";
import { Banner } from "../ui/banner";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet";
import { Tooltip } from "../ui/tooltip";
import { errorMessage } from "./admin-utils";

/** Canonical administrator sidebar destination identifiers. */
type AdminNavSectionId =
  | "dashboard"
  | "users"
  | "progress"
  | "content"
  | "reports"
  | "logs"
  | "maintenance"
  | "settings"
  | "profile";

/** Accepted `active` route identifier values for {@link AdminShell}. */
export type AdminActiveNav = AdminNavSectionId | "notifications";

/** Single navigation link definition inside {@link ADMIN_NAV_SECTIONS}. */
interface AdminNavItem {
  readonly id: AdminNavSectionId;
  readonly href: string;
  readonly label: string;
  readonly Icon: LucideIcon;
}

/** Named group of administrator sidebar links. */
interface AdminNavSection {
  readonly id: string;
  readonly label: string;
  readonly ariaLabel: string;
  readonly items: ReadonlyArray<AdminNavItem>;
}

/** LocalStorage key persisting the desktop administrator sidebar collapsed state. */
export const ADMIN_SIDEBAR_COLLAPSED_KEY = "mindguide.admin.sidebarCollapsed";

/** Grouped primary administrator navigation sections rendered above the footer nav. */
const ADMIN_NAV_SECTIONS: ReadonlyArray<AdminNavSection> = [
  {
    id: "overview",
    label: "OVERVIEW",
    ariaLabel: "Overview navigation",
    items: [
      {
        id: "dashboard",
        href: "/admin/dashboard",
        label: "Dashboard",
        Icon: LayoutDashboard,
      },
    ],
  },
  {
    id: "learning-management",
    label: "LEARNING MANAGEMENT",
    ariaLabel: "Learning management navigation",
    items: [
      {
        id: "users",
        href: "/admin/users",
        label: "User Accounts",
        Icon: Users,
      },
      {
        id: "progress",
        href: "/admin/progress",
        label: "Learner Progress",
        Icon: TrendingUp,
      },
      {
        id: "content",
        href: "/admin/content/problems",
        label: "Content Library",
        Icon: BookOpen,
      },
      {
        id: "reports",
        href: "/admin/reports",
        label: "Reports",
        Icon: BarChart3,
      },
    ],
  },
  {
    id: "system-management",
    label: "SYSTEM MANAGEMENT",
    ariaLabel: "System management navigation",
    items: [
      {
        id: "logs",
        href: "/admin/logs",
        label: "Activity & AI Logs",
        Icon: Activity,
      },
      {
        id: "maintenance",
        href: "/admin/maintenance",
        label: "Cohort & Access",
        Icon: Database,
      },
      {
        id: "settings",
        href: "/admin/settings",
        label: "Settings",
        Icon: Settings,
      },
    ],
  },
];

/** Bottom-anchored administrator account navigation items. */
const ADMIN_BOTTOM_NAV_ITEMS: ReadonlyArray<AdminNavItem> = [
  {
    id: "profile",
    href: "/admin/profile",
    label: "My Profile",
    Icon: User,
  },
];

/** Props for {@link AdminShell}. */
export interface AdminShellProps {
  /** Active navigation section identifier used to mark `aria-current="page"`. */
  active: AdminActiveNav;
  /** Page body rendered inside the main scroll container. */
  children: ReactNode;
}

function readSidebarCollapsedPreference(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(ADMIN_SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

function writeSidebarCollapsedPreference(collapsed: boolean): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ADMIN_SIDEBAR_COLLAPSED_KEY, String(collapsed));
  } catch {
    // Ignore storage failures in restricted browser environments.
  }
}

function getInitials(displayName: string): string {
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return initials || "AD";
}

function adminNavLinkClass(isActive: boolean, collapsed = false): string {
  const layout = collapsed
    ? "justify-center px-2 py-2.5"
    : "gap-3 px-3 py-2.5";

  return `flex min-h-11 items-center rounded-xl text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${layout} ${
    isActive
      ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20"
      : "text-slate-600 hover:bg-indigo-50/70 hover:text-indigo-950 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-slate-100"
  }`;
}

function AdminBrand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link
      to="/admin/dashboard"
      aria-label="MINDGUIDE Admin"
      className={`flex items-center rounded-xl text-lg font-extrabold tracking-tight text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-white ${
        collapsed ? "w-full justify-center py-0.5" : "w-fit gap-2.5"
      }`}
    >
      <MindGuideLogo
        decorative
        className="h-10 w-11 shrink-0 rounded-xl bg-white shadow-sm ring-1 ring-indigo-100 dark:ring-indigo-500/20"
      />
      {!collapsed && (
        <span className="flex items-center gap-2 whitespace-nowrap">
          <span>MINDGUIDE</span>
          <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-indigo-700 ring-1 ring-indigo-200/80 dark:bg-indigo-500/20 dark:text-indigo-300 dark:ring-indigo-500/30">
            ADMIN
          </span>
        </span>
      )}
    </Link>
  );
}

function AdminNavLinks({
  active,
  items,
  collapsed = false,
  closeOnNavigate = false,
}: {
  active: AdminActiveNav;
  items: ReadonlyArray<AdminNavItem>;
  collapsed?: boolean;
  closeOnNavigate?: boolean;
}) {
  return (
    <div className="space-y-1">
      {items.map(({ id, href, label, Icon }) => {
        const isActive = active === id;
        const link = (
          <Link
            key={id}
            to={href}
            aria-current={isActive ? "page" : undefined}
            className={adminNavLinkClass(isActive, collapsed)}
          >
            <Icon aria-hidden="true" className="h-4.5 w-4.5 shrink-0" />
            <span className={collapsed ? "sr-only" : "truncate"}>{label}</span>
          </Link>
        );

        if (closeOnNavigate) {
          return (
            <SheetClose asChild key={id}>
              {link}
            </SheetClose>
          );
        }

        if (collapsed) {
          return (
            <Tooltip key={id} label={label}>
              {link}
            </Tooltip>
          );
        }

        return link;
      })}
    </div>
  );
}

function AdminSectionGroup({
  section,
  active,
  collapsed = false,
  closeOnNavigate = false,
}: {
  section: AdminNavSection;
  active: AdminActiveNav;
  collapsed?: boolean;
  closeOnNavigate?: boolean;
}) {
  const headingId = `${closeOnNavigate ? "mobile" : "desktop"}-admin-nav-${section.id}`;

  return (
    <nav aria-labelledby={headingId} className="space-y-1.5">
      {collapsed ? (
        <>
          <div
            aria-hidden="true"
            className="mx-2 my-2 border-t border-slate-200/80 dark:border-slate-800"
          />
          <p id={headingId} className="sr-only">
            {section.label}
          </p>
        </>
      ) : (
        <p
          id={headingId}
          className="px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500"
        >
          {section.label}
        </p>
      )}
      <AdminNavLinks
        active={active}
        items={section.items}
        collapsed={collapsed}
        closeOnNavigate={closeOnNavigate}
      />
    </nav>
  );
}

function AdminSignOutButton({
  onSignOut,
  collapsed = false,
  disabled = false,
}: {
  onSignOut: () => Promise<void>;
  collapsed?: boolean;
  disabled?: boolean;
}) {
  const button = (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void onSignOut()}
      className={`flex min-h-11 w-full items-center rounded-xl text-sm font-semibold text-rose-600 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-400 dark:hover:bg-rose-950/30 ${
        collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
      }`}
    >
      <LogOut aria-hidden="true" className="h-4.5 w-4.5 shrink-0" />
      <span className={collapsed ? "sr-only" : "truncate"}>Sign Out</span>
    </button>
  );

  return collapsed ? <Tooltip label="Sign Out">{button}</Tooltip> : button;
}

/**
 * Shared administrator console shell providing the grouped collapsible desktop sidebar,
 * responsive mobile navigation sheet, top utility bar with notification drawer,
 * theme toggle, profile shortcut, and sign-out banner handling.
 *
 * @param props - See {@link AdminShellProps}.
 * @returns The administrator layout shell wrapping `children`.
 */
export function AdminShell({ active, children }: AdminShellProps) {
  const signOut = useAuthStore((state) => state.signOut);
  const userProfile = useAuthStore((state) => state.userProfile);
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();
  const displayName = userProfile?.displayName?.trim() || "System Admin";
  const email = userProfile?.email || "Admin Console";
  const initials = getInitials(displayName);
  const isDark = resolvedTheme === "dark";
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(
    readSidebarCollapsedPreference,
  );

  function handleToggleSidebar() {
    setIsSidebarCollapsed((previous) => {
      const next = !previous;
      writeSidebarCollapsedPreference(next);
      return next;
    });
  }

  async function handleSignOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setSignOutError(null);
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (cause) {
      setSignOutError(errorMessage(cause, "Sign out failed. Please try again."));
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="app-shell flex h-dvh min-h-0 w-full overflow-hidden bg-slate-50 text-slate-950 dark:bg-[#050816] dark:text-slate-100">
      <aside
        id="admin-desktop-sidebar"
        aria-label="Administrator sidebar"
        className={`hidden h-full min-h-0 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white py-5 transition-[width,padding] duration-200 motion-reduce:transition-none dark:border-slate-800/80 dark:bg-[#0b1120] md:flex ${
          isSidebarCollapsed ? "w-20 px-2.5" : "w-64 px-4"
        }`}
      >
        <AdminBrand collapsed={isSidebarCollapsed} />

        <div className="mt-7 space-y-6">
          {ADMIN_NAV_SECTIONS.map((section) => (
            <AdminSectionGroup
              key={section.id}
              section={section}
              active={active}
              collapsed={isSidebarCollapsed}
            />
          ))}
        </div>

        <div className="mt-auto shrink-0 space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
          <nav aria-labelledby="desktop-admin-nav-bottom" className="space-y-1.5">
            {isSidebarCollapsed ? (
              <p id="desktop-admin-nav-bottom" className="sr-only">
                BOTTOM NAVIGATION
              </p>
            ) : (
              <p
                id="desktop-admin-nav-bottom"
                className="px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500"
              >
                BOTTOM NAVIGATION
              </p>
            )}
            <AdminNavLinks
              active={active}
              items={ADMIN_BOTTOM_NAV_ITEMS}
              collapsed={isSidebarCollapsed}
            />
          </nav>
          <AdminSignOutButton
            onSignOut={handleSignOut}
            collapsed={isSidebarCollapsed}
            disabled={isSigningOut}
          />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {signOutError && (
          <Banner tone="error" onDismiss={() => setSignOutError(null)}>
            {signOutError}
          </Banner>
        )}

        <header className="z-30 flex h-16 shrink-0 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur dark:border-slate-800/80 dark:bg-[#0b1120]/95 sm:px-6">
          <div className="mr-3 md:hidden">
            <Sheet>
              <Tooltip label="Open administrator navigation">
                <SheetTrigger asChild>
                  <button
                    type="button"
                    aria-label="Open administrator navigation"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Menu aria-hidden="true" className="h-5 w-5" />
                  </button>
                </SheetTrigger>
              </Tooltip>
              <SheetContent
                side="left"
                className="mobile-navigation flex w-[min(20rem,88vw)] flex-col border-slate-200 bg-white p-5 text-slate-950 dark:border-slate-800 dark:bg-[#0b1120] dark:text-slate-100"
              >
                <SheetHeader className="p-0 text-left">
                  <SheetTitle className="sr-only">Administrator navigation</SheetTitle>
                  <SheetDescription className="sr-only">
                    Navigate between MINDGUIDE administrator console pages.
                  </SheetDescription>
                  <AdminBrand />
                </SheetHeader>

                <div className="mt-7 space-y-6">
                  {ADMIN_NAV_SECTIONS.map((section) => (
                    <AdminSectionGroup
                      key={section.id}
                      section={section}
                      active={active}
                      closeOnNavigate
                    />
                  ))}
                </div>

                <div className="mt-auto shrink-0 space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                  <nav aria-labelledby="mobile-admin-nav-bottom" className="space-y-1.5">
                    <p
                      id="mobile-admin-nav-bottom"
                      className="px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500"
                    >
                      BOTTOM NAVIGATION
                    </p>
                    <AdminNavLinks
                      active={active}
                      items={ADMIN_BOTTOM_NAV_ITEMS}
                      closeOnNavigate
                    />
                  </nav>
                  <AdminSignOutButton onSignOut={handleSignOut} disabled={isSigningOut} />
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <div className="mr-3 hidden md:block">
            <Tooltip
              label={
                isSidebarCollapsed
                  ? "Expand administrator sidebar"
                  : "Collapse administrator sidebar"
              }
            >
              <button
                type="button"
                onClick={handleToggleSidebar}
                aria-label={
                  isSidebarCollapsed
                    ? "Expand administrator sidebar"
                    : "Collapse administrator sidebar"
                }
                aria-expanded={!isSidebarCollapsed}
                aria-controls="admin-desktop-sidebar"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-indigo-300"
              >
                {isSidebarCollapsed ? (
                  <PanelLeftOpen aria-hidden="true" className="h-5 w-5" />
                ) : (
                  <PanelLeftClose aria-hidden="true" className="h-5 w-5" />
                )}
              </button>
            </Tooltip>
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold text-slate-950 dark:text-white sm:text-lg">
              Welcome, {displayName}
            </h1>
          </div>

          <HelpDialog variant="admin" triggerClassName="mr-1.5 sm:mr-2" />

          <NotificationDrawer notificationsHref="/admin/notifications" />

          <Tooltip label={isDark ? "Switch to light theme" : "Switch to dark theme"}>
            <button
              type="button"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
              className="mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              {isDark ? (
                <Sun aria-hidden="true" className="h-4.5 w-4.5" />
              ) : (
                <Moon aria-hidden="true" className="h-4.5 w-4.5" />
              )}
            </button>
          </Tooltip>

          <Tooltip label={`Open profile for ${displayName}`}>
            <Link
              to="/admin/profile"
              aria-label={`Open profile for ${displayName}`}
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-3 rounded-xl px-1.5 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800"
            >
              <span className="hidden max-w-48 text-right sm:block">
                <span className="block truncate text-sm font-bold text-slate-800 dark:text-slate-100">
                  {displayName}
                </span>
                <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                  {email}
                </span>
              </span>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30">
                {initials}
              </span>
            </Link>
          </Tooltip>
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain">
          <div className="responsive-content mx-auto w-full min-w-0 max-w-7xl p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
