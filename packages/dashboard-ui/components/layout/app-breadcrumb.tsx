"use client";

import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const SEGMENT_LABELS: Record<string, string> = {
  overview: "Resumen",
  sessions: "Sesiones",
  messages: "Mensajes",
  connections: "Conexiones",
  webhooks: "Webhooks",
  developer: "Desarrollador",
  "api-reference": "Referencia de API",
  logs: "Registro de solicitudes",
  settings: "Configuración",
  "style-guide": "Guía de estilo",
};

export function AppBreadcrumb() {
  const pathname = usePathname();
  // strip leading /dashboard/ prefix for segment building
  const stripped = pathname.replace(/^\/dashboard\/?/, "");
  const segments = stripped ? stripped.split("/").filter(Boolean) : [];

  if (segments.length === 0) return null;

  const crumbs = segments.map((seg, i) => {
    const label = SEGMENT_LABELS[seg] ?? seg;
    const href = "/dashboard/" + segments.slice(0, i + 1).join("/");
    const isLast = i === segments.length - 1;
    return { label, href, isLast };
  });

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1.5">
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {crumb.isLast ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </span>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
