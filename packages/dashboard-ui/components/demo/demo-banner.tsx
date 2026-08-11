import { Info } from "lucide-react"

/**
 * Persistent banner shown across the whole dashboard in DEMO_MODE so nobody
 * mistakes the seeded data for a real WhatsApp connection.
 */
export function DemoBanner() {
  return (
    <div className="flex items-center justify-center gap-2 border-b border-amber-300/40 bg-amber-400/10 px-4 py-2 text-center text-xs font-medium text-amber-700 dark:text-amber-300">
      <Info className="size-3.5 shrink-0" />
      <span>
        Datos de demostración — esta es una vitrina de solo lectura. Sin conexión real a WhatsApp; los cambios no se guardan.{" "}
        <a href="https://wasphere.com/docs/getting-started/quick-start/" className="underline underline-offset-2">
          Despliega el tuyo →
        </a>
      </span>
    </div>
  )
}
