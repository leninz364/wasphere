import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AuthProvider } from "@/components/auth/auth-provider";
import { DEMO_MODE } from "@/lib/demo";
import { DemoBanner } from "@/components/demo/demo-banner";
import { UpdateBanner } from "@/components/layout/update-banner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side guard: if no access cookie, send to login before any render.
  // DEMO_MODE bypasses auth entirely (seeded read-only showcase).
  const cookieStore = await cookies();
  const hasAccess = cookieStore.has("wa_access");
  // Keep the menu open by default and preserve explicit user toggles. The
  // SidebarProvider updates this cookie whenever its trigger is used.
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";
  if (!DEMO_MODE && !hasAccess) {
    redirect("/login?reason=expired");
  }

  return (
    <AuthProvider>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <AppSidebar demoMode={DEMO_MODE} />
        <div className="flex h-screen min-h-0 flex-1 flex-col overflow-hidden">
          {/* Mobile-only bar: on phones the sidebar is a hidden drawer, so we
              need a visible trigger. On md+ the trigger lives in the sidebar
              header and this bar disappears, freeing the vertical space. */}
          <div className="flex h-10 shrink-0 items-center gap-2 border-b px-2 md:hidden">
            <SidebarTrigger className="h-7 w-7" />
            <span className="text-sm font-medium">BChat</span>
          </div>
          {DEMO_MODE ? <DemoBanner /> : <UpdateBanner />}
          <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6">
            {children}
          </main>
        </div>
      </SidebarProvider>
    </AuthProvider>
  );
}
