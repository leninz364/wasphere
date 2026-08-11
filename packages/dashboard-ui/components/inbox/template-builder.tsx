"use client"

import * as React from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

// AUTHENTICATION omitted: Meta requires a dedicated OTP button + security
// body for that category, which this simple builder doesn't produce — so
// those submissions always reject. Re-add when OTP components are supported.
const CATEGORIES = ["UTILITY", "MARKETING"] as const
const LANGUAGES = ["en_US", "en_GB", "en", "es_ES", "es", "pt_BR", "fr", "de", "ar", "hi", "id", "ur"]

/** Unique {{n}} variable indices found in the body, in ascending order. */
function variablesIn(body: string): number[] {
  const found = new Set<number>()
  for (const m of body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) found.add(parseInt(m[1], 10))
  return [...found].sort((a, b) => a - b)
}

export function TemplateBuilder({
  sessionId,
  open,
  onOpenChange,
  onCreated,
}: {
  sessionId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}) {
  const [name, setName] = React.useState("")
  const [category, setCategory] = React.useState<(typeof CATEGORIES)[number]>("UTILITY")
  const [language, setLanguage] = React.useState("en_US")
  const [headerText, setHeaderText] = React.useState("")
  const [body, setBody] = React.useState("")
  const [footer, setFooter] = React.useState("")
  const [examples, setExamples] = React.useState<Record<number, string>>({})
  const [busy, setBusy] = React.useState(false)

  const vars = React.useMemo(() => variablesIn(body), [body])

  const reset = () => {
    setName(""); setCategory("UTILITY"); setLanguage("en_US")
    setHeaderText(""); setBody(""); setFooter(""); setExamples({})
  }

  const submit = async () => {
    const cleanName = name.trim().toLowerCase()
    if (!/^[a-z0-9_]{1,512}$/.test(cleanName)) {
      toast.error("Nombre: solo minúsculas, números y guiones bajos.")
      return
    }
    if (!body.trim()) { toast.error("El texto del cuerpo es obligatorio."); return }
    if (vars.some((v) => !examples[v]?.trim())) {
      toast.error("Proporciona un valor de ejemplo para cada variable.")
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName,
          category,
          language,
          headerText: headerText.trim() || undefined,
          body: body.trim(),
          bodyExamples: vars.length ? vars.map((v) => examples[v].trim()) : undefined,
          footer: footer.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.message ?? "No se pudo crear la plantilla."); return }
      toast.success(`Plantilla "${cleanName}" enviada a Meta — estado: ${data.status ?? "PENDIENTE"}.`)
      reset()
      onOpenChange(false)
      onCreated?.()
    } catch {
      toast.error("No se pudo comunicar con el servidor.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Nueva plantilla</DialogTitle></DialogHeader>
        <div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tb-name">Nombre</Label>
              <Input id="tb-name" value={name} placeholder="actualizar_pedido" maxLength={512}
                onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tb-cat">Categoría</Label>
              <select id="tb-cat" value={category} onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c[0] + c.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tb-lang">Idioma</Label>
            <select id="tb-lang" value={language} onChange={(e) => setLanguage(e.target.value)}
              className="h-9 w-40 rounded-md border border-input bg-transparent px-3 text-sm">
              {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tb-header">Encabezado <span className="text-muted-foreground">(opcional)</span></Label>
            <Input id="tb-header" value={headerText} maxLength={60} placeholder="Actualización de pedido"
              onChange={(e) => setHeaderText(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tb-body">Cuerpo</Label>
            <textarea id="tb-body" value={body} rows={4} maxLength={1024}
              placeholder="Hola {{1}}, tu pedido {{2}} ahora está {{3}}."
              onChange={(e) => setBody(e.target.value)}
              className="rounded-md border border-input bg-transparent p-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            <p className="text-xs text-muted-foreground">Usa {`{{1}}`}, {`{{2}}`}… para variables.</p>
          </div>

          {vars.length > 0 && (
            <div className="flex flex-col gap-2 rounded-md border border-input bg-muted/30 p-3">
              <p className="text-xs font-medium">Valores de ejemplo (Meta requiere uno por variable)</p>
              {vars.map((v) => (
                <div key={v} className="flex items-center gap-2">
                  <span className="w-12 text-xs tabular-nums text-muted-foreground">{`{{${v}}}`}</span>
                  <Input value={examples[v] ?? ""} placeholder={`Ejemplo para {{${v}}}`}
                    onChange={(e) => setExamples((p) => ({ ...p, [v]: e.target.value }))} className="h-8" />
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tb-footer">Pie de página <span className="text-muted-foreground">(opcional)</span></Label>
            <Input id="tb-footer" value={footer} maxLength={60} placeholder="Responde STOP para darte de baja"
              onChange={(e) => setFooter(e.target.value)} />
          </div>

          <p className="text-xs text-muted-foreground">
            Las plantillas son revisadas por Meta antes de poder ser enviadas — la aprobación generalmente toma de unos minutos a unas horas.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={() => void submit()} disabled={busy}>{busy ? "Enviando…" : "Enviar para aprobación"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
