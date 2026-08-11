"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Smartphone,
  Inbox,
  Contact,
  MessageSquare,
  Cable,
  Settings,
  Users,
  BookOpen,
  ShieldCheck,
  Moon,
  Sun,
  Monitor,
  LogOut,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/components/auth/auth-provider";
import { logout } from "@/lib/api";
import { useTheme } from "next-themes";
import { APP_VERSION } from "@/lib/version";
import { nameStyleCss, type NameStyle } from "@/lib/name-style";
// `cap` → the workspace capability required to see this item (see
// dashboard-api/src/lib/capabilities.ts). `always` items are visible to every
// member; `adminOnly` items are OWNER/ADMIN only. Owners/admins have every
// capability, so they see everything.
const NAV_ITEMS: {
  label: string;
  href: string;
  icon: React.ElementType;
  cap?: string;
  always?: boolean;
  adminOnly?: boolean;
}[] = [
  { label: "Resumen", href: "/dashboard/overview", icon: LayoutDashboard, always: true },
  { label: "Bandeja", href: "/dashboard/inbox", icon: Inbox, cap: "inbox" },
  { label: "Contactos", href: "/dashboard/contacts", icon: Contact, cap: "contacts" },
  { label: "Equipo", href: "/dashboard/team", icon: Users, always: true },
  { label: "Mensajes", href: "/dashboard/messages", icon: MessageSquare, cap: "messages" },
  { label: "Conexiones", href: "/dashboard/connections", icon: Cable, adminOnly: true },
  { label: "Sesiones", href: "/dashboard/sessions", icon: Smartphone, cap: "sessions" },
  { label: "Configuración", href: "/dashboard/settings", icon: Settings, cap: "settings" },
];

function NavItem({
  label,
  href,
  icon: Icon,
  active,
  collapsed,
}: {
  label: string;
  href: string;
  icon: React.ElementType;
  active: boolean;
  collapsed: boolean;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarMenuItem className="mb-0.5">
      <SidebarMenuButton
        render={<Link href={href} onClick={() => { if (isMobile) setOpenMobile(false); }} />}
        isActive={active}
        tooltip={label}
        className={[
          collapsed
            ? "flex-col justify-center gap-1 h-auto py-2"
            : "flex-row gap-2",
          // active: dark bg + black/white text, bold
          "data-active:!bg-primary/10 data-active:!text-primary dark:data-active:!bg-primary/15 dark:data-active:!text-primary data-active:!font-semibold",
        ].join(" ")}
      >
        <Icon className="shrink-0" size={18} />
        <span
          className={
            collapsed
              ? "text-[10px] text-center leading-none"
              : "text-sm leading-none"
          }
        >
          {label}
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar({ demoMode = false }: { demoMode?: boolean }) {
  const pathname = usePathname();
  const { state, isMobile } = useSidebar();

  // Nav visibility is driven by the member's effective capabilities. Owners and
  // admins get everything; agents see Inbox/Contacts plus whatever they've been
  // granted. Until the role loads, show only the always-visible items to avoid a
  // flash of links an agent can't use.
  const [role, setRole] = React.useState<string | null>(null);
  const [caps, setCaps] = React.useState<string[] | null>(null);
  const [profile, setProfile] = React.useState<{ firstName: string | null; lastName: string | null; cargo: string | null; roleName: string | null }>({ firstName: null, lastName: null, cargo: null, roleName: null });
  React.useEffect(() => {
    fetch("/api/team/my-role")
      .then((r) => r.json())
      .then((d) => {
        setRole(d?.role ?? null);
        setCaps(Array.isArray(d?.capabilities) ? d.capabilities : null);
        setProfile({
          firstName: d?.firstName ?? null,
          lastName: d?.lastName ?? null,
          cargo: d?.cargo ?? null,
          roleName: d?.roleName ?? null,
        });
      })
      .catch(() => {});
  }, []);
  // In demo mode there's no auth/role backend, so /api/team/my-role never
  // resolves a role — treat the demo viewer as a manager so the full Core
  // sidebar (Sessions, Inbox, Contacts, Messages, Webhooks, Team, Developer,
  // Settings) is showcased instead of collapsing to just Overview.
  const isManager = demoMode || role === "OWNER" || role === "ADMIN";
  const navItems = NAV_ITEMS.filter((i) => {
    if (i.always) return true;
    if (i.adminOnly) return isManager;
    if (isManager) return true;
    if (caps === null) return false; // still loading — hide gated items
    return i.cap ? caps.includes(i.cap) : false;
  });
  // On mobile the sidebar is a full drawer — never icon-collapse it, and the
  // hover-to-expand behaviour is desktop-only.
  const collapsed = !isMobile && state === "collapsed";

  // In demo mode the local API-docs proxy has no backend, so link to the public
  // hosted docs instead.
  const docsBase = demoMode ? "https://app.wasphere.com" : "";

  // Workspace branding: custom logo, or the company name shown big when there
  // is no logo. Falls back to the BChat wordmark while loading / in demo.
  const [logo, setLogo] = React.useState<string | null>(null);
  const [companyName, setCompanyName] = React.useState<string | null>(null);
  const [nameStyle, setNameStyle] = React.useState<NameStyle | null>(null);
  React.useEffect(() => {
    if (demoMode) return;
    let active = true;
    fetch("/api/settings/workspace")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active) return;
        if (d?.logo) setLogo(d.logo as string);
        if (typeof d?.name === "string" && d.name.trim()) setCompanyName(d.name.trim());
        if (d?.nameStyle && typeof d.nameStyle === "object") setNameStyle(d.nameStyle as NameStyle);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [demoMode]);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-2">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            {logo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={logo} alt="Logo" className="h-8 w-8 object-contain" />
            ) : (
              <span
                className="text-primary font-bold text-lg"
                style={nameStyle?.color ? { color: nameStyle.color } : undefined}
              >
                {(companyName?.[0] ?? "B").toUpperCase()}
              </span>
            )}
            <SidebarTrigger className="h-7 w-7 shrink-0 text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex justify-end">
              <SidebarTrigger className="h-7 w-7 shrink-0 text-muted-foreground" />
            </div>
            {logo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={logo}
                alt="Logo"
                className="w-full max-h-24 object-contain px-1 pb-1"
              />
            ) : companyName ? (
              <span
                className="break-words px-1 pb-1 text-center text-xl font-bold leading-tight tracking-tight text-primary"
                style={nameStyleCss(nameStyle)}
              >
                {companyName}
              </span>
            ) : (
              <span className="px-1 pb-1 text-center text-xl font-bold tracking-tight text-primary">
                BChat
              </span>
            )}
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(({ label, href, icon }) => {
                const active =
                  pathname === href || pathname.startsWith(href + "/");
                return (
                  <NavItem
                    key={href}
                    label={label}
                    href={href}
                    icon={icon}
                    active={active}
                    collapsed={collapsed}
                  />
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>

      <SidebarFooter className="p-2">
        <UserMenu collapsed={collapsed} profile={profile} docsBase={docsBase} />
      </SidebarFooter>
    </Sidebar>
  );
}

// User card at the bottom of the sidebar: theme switcher + logout. This
// replaces the old top header's avatar dropdown.
function UserMenu({
  collapsed,
  profile,
  docsBase,
}: {
  collapsed: boolean;
  profile: { firstName: string | null; lastName: string | null; cargo: string | null; roleName: string | null };
  docsBase: string;
}) {
  const { user } = useAuth();
  const { setTheme } = useTheme();

  const profileName = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
  const displayName = profileName || user?.name || user?.email || "…";
  const displayCargo = profile.cargo || profile.roleName || "";
  const avatarInitial = (displayName[0] ?? "?").toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="w-full rounded-md outline-none">
        <div
          className={[
            "flex items-center gap-2 rounded-md transition-colors hover:bg-accent cursor-pointer",
            collapsed ? "justify-center p-1.5" : "px-2 py-1.5",
          ].join(" ")}
        >
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
              {avatarInitial}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex min-w-0 flex-col text-left">
              <span className="truncate text-xs font-medium leading-tight">{displayName}</span>
              {displayCargo && (
                <span className="truncate text-[10px] text-muted-foreground leading-tight">{displayCargo}</span>
              )}
            </div>
          )}
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={collapsed ? "right" : "top"} align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 pb-2">
            <span className="font-semibold text-sm">{displayName}</span>
            {displayCargo && (
              <span className="text-xs text-muted-foreground font-normal">{displayCargo}</span>
            )}
            <span className="text-[10px] text-muted-foreground/70 font-normal">BChat v{APP_VERSION}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal pb-1">
            Documentación
          </DropdownMenuLabel>
          <DropdownMenuItem className="gap-2" onClick={() => window.open(`${docsBase}/docs/wa-server`, "_blank", "noopener,noreferrer")}>
            <BookOpen size={14} /> API de WhatsApp
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onClick={() => window.open(`${docsBase}/docs/admin`, "_blank", "noopener,noreferrer")}>
            <ShieldCheck size={14} /> API de administración
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal pb-1">
            Tema
          </DropdownMenuLabel>
          <DropdownMenuItem className="gap-2" onClick={() => setTheme("light")}>
            <Sun size={14} /> Claro
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onClick={() => setTheme("dark")}>
            <Moon size={14} /> Oscuro
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onClick={() => setTheme("system")}>
            <Monitor size={14} /> Sistema
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            className="gap-2 text-destructive focus:text-destructive"
            onClick={() => void logout()}
          >
            <LogOut size={14} /> Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
