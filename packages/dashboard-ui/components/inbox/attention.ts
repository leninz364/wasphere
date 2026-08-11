import type { AttentionStatus, AssignedAgent } from "./types"

export const ATTENTION_LABELS: Record<AttentionStatus, string> = {
  PENDIENTE: "Pendiente",
  EN_PROCESO: "En proceso",
  ATENDIDO: "Atendido",
  SOLUCIONADO: "Solucionado",
}

// badge color classes per attention state
export const ATTENTION_CLASSES: Record<AttentionStatus, string> = {
  PENDIENTE: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  EN_PROCESO: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  ATENDIDO: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  SOLUCIONADO: "bg-muted text-muted-foreground",
}

// solid dot color per state (literal classes so Tailwind's scanner picks them up)
export const ATTENTION_DOT: Record<AttentionStatus, string> = {
  PENDIENTE: "bg-amber-500",
  EN_PROCESO: "bg-blue-500",
  ATENDIDO: "bg-emerald-500",
  SOLUCIONADO: "bg-gray-400",
}

export const ATTENTION_ORDER: AttentionStatus[] = [
  "PENDIENTE",
  "EN_PROCESO",
  "ATENDIDO",
  "SOLUCIONADO",
]

// Display name for the current handler. null assignee = the AI bot.
export function agentName(a: AssignedAgent | null): string {
  if (!a) return "Bot IA"
  return a.name || a.email.split("@")[0]
}
