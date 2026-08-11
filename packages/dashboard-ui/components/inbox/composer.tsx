"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  Paperclip, SendHorizonal, MessageSquareText, ImageIcon, FileText,
  BarChart3, X, Plus, Trash2, Pencil, MapPin, Contact, MousePointerClick, List, LayoutTemplate,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { StatusDot } from "@/components/ui/status-dot"
import { TemplateBuilder } from "./template-builder"
import type { OutboundReply } from "./types"

// ~7 MB raw keeps the base64 data URI under the WA server's 10 MB cap.
const MAX_FILE_BYTES = 7 * 1024 * 1024

const REPLIES_KEY = "wasphere.inbox.quickReplies"
const DEFAULT_REPLIES = [
  "¡Gracias por escribirnos! ¿En qué puedo ayudarte?",
  "Tu pedido está confirmado y se enviará pronto. 📦",
  "¿Podrías compartirnos tu número de pedido, por favor?",
  "Ahora estamos cerrados — te responderemos a primera hora mañana.",
]

type Attachment = {
  kind: "image" | "document"
  dataUri: string
  fileName: string
  mimetype: string
  previewUrl?: string
}

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

/** Provider capability flags (from GET /api/sessions/:id/capabilities). */
export type ComposerCapabilities = {
  polls?: boolean
  interactiveButtons?: boolean
  mediaUpload?: boolean
  templates?: boolean
} | null

export function Composer({
  onSend,
  sending,
  sessionOffline,
  capabilities,
  sessionId,
}: {
  onSend: (reply: OutboundReply) => Promise<boolean>
  sending: boolean
  sessionOffline: boolean
  capabilities?: ComposerCapabilities
  sessionId?: string | null
}) {
  // Unknown capabilities (null) → assume Baileys-style (everything on). Meta
  // turns the relevant flags off, so those entries hide automatically.
  const can = {
    media: capabilities?.mediaUpload ?? true,
    poll: capabilities?.polls ?? true,
    interactive: capabilities?.interactiveButtons ?? true,
    template: capabilities?.templates ?? false, // Meta only
  }
  const [text, setText] = React.useState("")
  const [attachment, setAttachment] = React.useState<Attachment | null>(null)
  const imageInputRef = React.useRef<HTMLInputElement>(null)
  const docInputRef = React.useRef<HTMLInputElement>(null)

  const [pollOpen, setPollOpen] = React.useState(false)
  const [pollName, setPollName] = React.useState("")
  const [pollOptions, setPollOptions] = React.useState<string[]>(["", ""])
  const [pollMulti, setPollMulti] = React.useState(false)
  const [pollSending, setPollSending] = React.useState(false)

  // Location
  const [locOpen, setLocOpen] = React.useState(false)
  const [lat, setLat] = React.useState("")
  const [lng, setLng] = React.useState("")
  const [locName, setLocName] = React.useState("")
  const [locAddr, setLocAddr] = React.useState("")
  const [extraSending, setExtraSending] = React.useState(false)

  // Contact
  const [contactOpen, setContactOpen] = React.useState(false)
  const [cName, setCName] = React.useState("")
  const [cPhone, setCPhone] = React.useState("")

  // Buttons
  const [btnOpen, setBtnOpen] = React.useState(false)
  const [btnBody, setBtnBody] = React.useState("")
  const [btnFooter, setBtnFooter] = React.useState("")
  const [btns, setBtns] = React.useState<string[]>(["", ""])

  // List
  const [listOpen, setListOpen] = React.useState(false)
  const [listHeader, setListHeader] = React.useState("")
  const [listBody, setListBody] = React.useState("")
  const [listBtn, setListBtn] = React.useState("")
  const [listRows, setListRows] = React.useState<{ title: string; description: string }[]>([{ title: "", description: "" }])

  // Template (Meta)
  type Tpl = { name: string; language: string; status: string; bodyText: string; variables: number }
  const [tplOpen, setTplOpen] = React.useState(false)
  const [tplBuilderOpen, setTplBuilderOpen] = React.useState(false)
  const [tplList, setTplList] = React.useState<Tpl[]>([])
  const [tplLoading, setTplLoading] = React.useState(false)
  const [tplSel, setTplSel] = React.useState<Tpl | null>(null)
  const [tplParams, setTplParams] = React.useState<string[]>([])

  const openTemplate = async () => {
    setTplOpen(true); setTplSel(null); setTplParams([])
    if (!sessionId) return
    setTplLoading(true)
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/templates`)
      const data = await res.json()
      const list: Tpl[] = (Array.isArray(data) ? data : []).filter((t: Tpl) => t.status === "APPROVED")
      setTplList(list)
    } catch {
      toast.error("No se pudieron cargar las plantillas.")
    } finally {
      setTplLoading(false)
    }
  }

  const pickTemplate = (t: Tpl) => { setTplSel(t); setTplParams(Array.from({ length: t.variables }, () => "")) }

  const sendTemplate = async () => {
    if (!tplSel) return
    if (tplParams.some((p) => !p.trim())) { toast.error("Completa todas las variables de la plantilla."); return }
    setExtraSending(true)
    const ok = await onSend({
      kind: "template",
      templateName: tplSel.name,
      languageCode: tplSel.language,
      bodyParams: tplParams.length ? tplParams.map((p) => p.trim()) : undefined,
    })
    setExtraSending(false)
    if (ok) { setTplOpen(false); setTplSel(null); setTplParams([]) }
  }

  const [savedReplies, setSavedReplies] = React.useState<string[]>(DEFAULT_REPLIES)
  const [manageOpen, setManageOpen] = React.useState(false)
  const [draftReplies, setDraftReplies] = React.useState<string[]>([])

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(REPLIES_KEY)
      if (raw) setSavedReplies(JSON.parse(raw) as string[])
    } catch { /* ignore */ }
  }, [])

  const openManage = () => { setDraftReplies(savedReplies.length ? [...savedReplies] : [""]); setManageOpen(true) }
  const saveManage = () => {
    const cleaned = draftReplies.map((s) => s.trim()).filter(Boolean)
    setSavedReplies(cleaned)
    try { localStorage.setItem(REPLIES_KEY, JSON.stringify(cleaned)) } catch { /* ignore */ }
    setManageOpen(false)
  }

  const busy = sending || sessionOffline

  const pickFile = async (file: File | undefined, kind: "image" | "document") => {
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      toast.error("Archivo demasiado grande — máx. 7 MB.")
      return
    }
    try {
      const dataUri = await fileToDataUri(file)
      setAttachment({
        kind,
        dataUri,
        fileName: file.name,
        mimetype: file.type || (kind === "image" ? "image/jpeg" : "application/octet-stream"),
        previewUrl: kind === "image" ? dataUri : undefined,
      })
    } catch {
      toast.error("No se pudo leer el archivo.")
    }
  }

  const submit = async () => {
    if (busy) return
    if (attachment) {
      const reply: OutboundReply =
        attachment.kind === "image"
          ? { kind: "image", media: attachment.dataUri, caption: text.trim() || undefined }
          : { kind: "document", media: attachment.dataUri, fileName: attachment.fileName, mimetype: attachment.mimetype }
      const ok = await onSend(reply)
      if (ok) { setAttachment(null); setText("") }
      return
    }
    const value = text.trim()
    if (!value) return
    const ok = await onSend({ kind: "text", text: value })
    if (ok) setText("")
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void submit()
    }
  }

  const sendPoll = async () => {
    const name = pollName.trim()
    const opts = pollOptions.map((o) => o.trim()).filter(Boolean)
    if (!name) { toast.error("La encuesta necesita una pregunta."); return }
    if (opts.length < 2) { toast.error("La encuesta necesita al menos 2 opciones."); return }
    setPollSending(true)
    const ok = await onSend({
      kind: "poll",
      pollName: name,
      options: opts,
      selectableCount: pollMulti ? opts.length : 1,
    })
    setPollSending(false)
    if (ok) { setPollOpen(false); setPollName(""); setPollOptions(["", ""]); setPollMulti(false) }
  }

  const sendLocation = async () => {
    const latN = Number(lat), lngN = Number(lng)
    if (!Number.isFinite(latN) || latN < -90 || latN > 90) { toast.error("La latitud debe estar entre -90 y 90."); return }
    if (!Number.isFinite(lngN) || lngN < -180 || lngN > 180) { toast.error("La longitud debe estar entre -180 y 180."); return }
    setExtraSending(true)
    const ok = await onSend({ kind: "location", latitude: latN, longitude: lngN, locationName: locName.trim() || undefined, address: locAddr.trim() || undefined })
    setExtraSending(false)
    if (ok) { setLocOpen(false); setLat(""); setLng(""); setLocName(""); setLocAddr("") }
  }

  const sendContact = async () => {
    const name = cName.trim(), phone = cPhone.trim()
    if (!name) { toast.error("El contacto necesita un nombre."); return }
    if (!phone) { toast.error("El contacto necesita un número de teléfono."); return }
    setExtraSending(true)
    const ok = await onSend({ kind: "contact", contactName: name, contactPhone: phone })
    setExtraSending(false)
    if (ok) { setContactOpen(false); setCName(""); setCPhone("") }
  }

  const sendButtons = async () => {
    const body = btnBody.trim()
    const labels = btns.map((b) => b.trim()).filter(Boolean)
    if (!body) { toast.error("El mensaje con botones necesita texto en el cuerpo."); return }
    if (labels.length < 1) { toast.error("Agrega al menos un botón."); return }
    setExtraSending(true)
    const ok = await onSend({
      kind: "buttons",
      text: body,
      footer: btnFooter.trim() || " ",
      buttons: labels.map((t, i) => ({ id: `btn_${i + 1}`, text: t })),
    })
    setExtraSending(false)
    if (ok) { setBtnOpen(false); setBtnBody(""); setBtnFooter(""); setBtns(["", ""]) }
  }

  const sendList = async () => {
    const header = listHeader.trim(), body = listBody.trim(), btn = listBtn.trim()
    const rows = listRows.map((r) => ({ title: r.title.trim(), description: r.description.trim() })).filter((r) => r.title)
    if (!body) { toast.error("El mensaje de lista necesita texto en el cuerpo."); return }
    if (!btn) { toast.error("La lista necesita una etiqueta de botón."); return }
    if (rows.length < 1) { toast.error("Agrega al menos un elemento a la lista."); return }
    setExtraSending(true)
    const ok = await onSend({
      kind: "list",
      listTitle: header || "Menú",
      text: body,
      buttonText: btn,
      sections: [{ title: header || "Opciones", rows: rows.map((r, i) => ({ id: `row_${i + 1}`, title: r.title, description: r.description || undefined })) }],
    })
    setExtraSending(false)
    if (ok) { setListOpen(false); setListHeader(""); setListBody(""); setListBtn(""); setListRows([{ title: "", description: "" }]) }
  }

  return (
    <div className="border-t p-3">
      {sessionOffline && (
        <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <StatusDot status="disconnected" />
          Sesión desconectada — reconéctate para enviar.
        </div>
      )}

      {attachment && (
        <div className="mb-2 flex items-center gap-2 rounded-md border bg-muted/40 p-2">
          {attachment.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={attachment.previewUrl} alt="" className="size-10 shrink-0 rounded object-cover" />
          ) : (
            <FileText className="size-5 shrink-0 opacity-70" />
          )}
          <span className="flex-1 truncate text-xs">{attachment.fileName}</span>
          <Button variant="ghost" size="icon" className="size-6" onClick={() => setAttachment(null)} title="Quitar">
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      <input
        ref={imageInputRef} type="file" accept="image/*" hidden
        onChange={(e) => { void pickFile(e.target.files?.[0], "image"); e.target.value = "" }}
      />
      <input
        ref={docInputRef} type="file" hidden
        onChange={(e) => { void pickFile(e.target.files?.[0], "document"); e.target.value = "" }}
      />

      <div className="flex items-end gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-9 shrink-0" disabled={busy} />}>
            <Paperclip className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {can.media && (
              <>
                <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
                  <ImageIcon className="mr-2 size-4" /> Foto
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => docInputRef.current?.click()}>
                  <FileText className="mr-2 size-4" /> Documento
                </DropdownMenuItem>
              </>
            )}
            {can.poll && (
              <DropdownMenuItem onClick={() => setPollOpen(true)}>
                <BarChart3 className="mr-2 size-4" /> Encuesta
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setLocOpen(true)}>
              <MapPin className="mr-2 size-4" /> Ubicación
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setContactOpen(true)}>
              <Contact className="mr-2 size-4" /> Contacto
            </DropdownMenuItem>
            {can.interactive && (
              <>
                <DropdownMenuItem onClick={() => setBtnOpen(true)}>
                  <MousePointerClick className="mr-2 size-4" /> Botones
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setListOpen(true)}>
                  <List className="mr-2 size-4" /> Lista
                </DropdownMenuItem>
              </>
            )}
            {can.template && (
              <DropdownMenuItem onClick={() => void openTemplate()}>
                <LayoutTemplate className="mr-2 size-4" /> Plantilla
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-9 shrink-0" disabled={busy} />}>
            <MessageSquareText className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Respuestas rápidas</DropdownMenuLabel>
              {savedReplies.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">Aún no hay respuestas rápidas.</div>
              )}
              {savedReplies.map((r, i) => (
                <DropdownMenuItem key={`${r}-${i}`} onClick={() => setText((t) => (t ? `${t} ${r}` : r))} className="whitespace-normal text-xs">
                  {r}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={openManage} className="text-xs font-medium text-primary">
                <Pencil className="mr-2 size-3.5" /> Gestionar respuestas rápidas
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            sessionOffline ? "Sesión desconectada…"
            : attachment?.kind === "image" ? "Agrega una descripción…  (Enter para enviar)"
            : "Escribe una respuesta…  (Enter para enviar, Shift+Enter para salto de línea)"
          }
          disabled={sessionOffline}
          rows={1}
          className="max-h-32 min-h-9 resize-none py-2"
        />

        <Button
          onClick={() => void submit()}
          size="icon"
          className="size-9 shrink-0"
          disabled={busy || (!attachment && !text.trim())}
        >
          <SendHorizonal className="size-4" />
        </Button>
      </div>

      <Dialog open={pollOpen} onOpenChange={setPollOpen}>
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crear encuesta</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="poll-q">Pregunta</Label>
              <Input id="poll-q" value={pollName} maxLength={255} placeholder="Pregunta algo…" onChange={(e) => setPollName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Opciones</Label>
              {pollOptions.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={opt} maxLength={100} placeholder={`Opción ${i + 1}`}
                    onChange={(e) => setPollOptions((p) => p.map((o, j) => (j === i ? e.target.value : o)))}
                  />
                  {pollOptions.length > 2 && (
                    <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => setPollOptions((p) => p.filter((_, j) => j !== i))} title="Quitar opción">
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
              {pollOptions.length < 12 && (
                <Button variant="outline" size="sm" className="self-start" onClick={() => setPollOptions((p) => [...p, ""])}>
                  <Plus className="mr-1 size-4" /> Agregar opción
                </Button>
              )}
            </div>
            <label className="flex cursor-pointer items-center justify-between rounded-md border p-2.5">
              <span className="text-sm text-foreground">Permitir múltiples respuestas</span>
              <Switch checked={pollMulti} onCheckedChange={(v) => setPollMulti(!!v)} />
            </label>
          </div>
          <DialogFooter>
            <Button onClick={() => void sendPoll()} disabled={pollSending}>
              {pollSending ? "Enviando…" : "Enviar encuesta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Location */}
      <Dialog open={locOpen} onOpenChange={setLocOpen}>
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader><DialogTitle>Enviar ubicación</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="loc-lat">Latitud</Label>
                <Input id="loc-lat" value={lat} placeholder="24.8607" onChange={(e) => setLat(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="loc-lng">Longitud</Label>
                <Input id="loc-lng" value={lng} placeholder="67.0011" onChange={(e) => setLng(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loc-name">Nombre <span className="text-zinc-400 font-light">(opcional)</span></Label>
              <Input id="loc-name" value={locName} maxLength={255} placeholder="Oficina" onChange={(e) => setLocName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loc-addr">Dirección <span className="text-zinc-400 font-light">(opcional)</span></Label>
              <Input id="loc-addr" value={locAddr} maxLength={512} placeholder="Street, City" onChange={(e) => setLocAddr(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => void sendLocation()} disabled={extraSending}>{extraSending ? "Enviando…" : "Enviar ubicación"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contact */}
      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader><DialogTitle>Enviar contacto</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-name">Nombre</Label>
              <Input id="c-name" value={cName} maxLength={100} placeholder="Juan Pérez" onChange={(e) => setCName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-phone">Número de teléfono</Label>
              <Input id="c-phone" value={cPhone} maxLength={30} placeholder="+1 415 555 2671" onChange={(e) => setCPhone(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => void sendContact()} disabled={extraSending}>{extraSending ? "Enviando…" : "Enviar contacto"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Buttons */}
      <Dialog open={btnOpen} onOpenChange={setBtnOpen}>
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader><DialogTitle>Botones de respuesta</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="btn-body">Texto del mensaje</Label>
              <Textarea id="btn-body" value={btnBody} maxLength={1024} rows={2} placeholder="¿Qué te gustaría hacer?" onChange={(e) => setBtnBody(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="btn-footer">Pie de página <span className="text-zinc-400 font-light">(opcional)</span></Label>
              <Input id="btn-footer" value={btnFooter} maxLength={60} placeholder="Powered by BChat" onChange={(e) => setBtnFooter(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Botones (1–3)</Label>
              {btns.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={b} maxLength={20} placeholder={`Botón ${i + 1}`} onChange={(e) => setBtns((p) => p.map((x, j) => (j === i ? e.target.value : x)))} />
                  {btns.length > 1 && (
                    <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => setBtns((p) => p.filter((_, j) => j !== i))} title="Quitar"><Trash2 className="size-4" /></Button>
                  )}
                </div>
              ))}
              {btns.length < 3 && (
                <Button variant="outline" size="sm" className="self-start" onClick={() => setBtns((p) => [...p, ""])}><Plus className="mr-1 size-4" /> Agregar botón</Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => void sendButtons()} disabled={extraSending}>{extraSending ? "Enviando…" : "Enviar botones"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* List */}
      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader><DialogTitle>Mensaje de lista</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="list-header">Encabezado <span className="text-zinc-400 font-light">(opcional)</span></Label>
                <Input id="list-header" value={listHeader} maxLength={60} placeholder="Menú" onChange={(e) => setListHeader(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="list-btn">Etiqueta del botón</Label>
                <Input id="list-btn" value={listBtn} maxLength={20} placeholder="Ver opciones" onChange={(e) => setListBtn(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="list-body">Texto del mensaje</Label>
              <Textarea id="list-body" value={listBody} maxLength={1024} rows={2} placeholder="Elige una opción a continuación" onChange={(e) => setListBody(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Elementos (1–10)</Label>
              {listRows.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={r.title} maxLength={24} placeholder={`Elemento ${i + 1} título`} onChange={(e) => setListRows((p) => p.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                  <Input value={r.description} maxLength={72} placeholder="Descripción (opcional)" onChange={(e) => setListRows((p) => p.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                  {listRows.length > 1 && (
                    <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => setListRows((p) => p.filter((_, j) => j !== i))} title="Quitar"><Trash2 className="size-4" /></Button>
                  )}
                </div>
              ))}
              {listRows.length < 10 && (
                <Button variant="outline" size="sm" className="self-start" onClick={() => setListRows((p) => [...p, { title: "", description: "" }])}><Plus className="mr-1 size-4" /> Agregar elemento</Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => void sendList()} disabled={extraSending}>{extraSending ? "Enviando…" : "Enviar lista"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template (Meta) */}
      <Dialog open={tplOpen} onOpenChange={setTplOpen}>
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader><DialogTitle>Enviar plantilla</DialogTitle></DialogHeader>
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            {tplLoading ? (
              <p className="text-sm text-muted-foreground">Cargando plantillas…</p>
            ) : !tplSel ? (
              <>
                <button
                  onClick={() => setTplBuilderOpen(true)}
                  className="flex items-center gap-1.5 self-start rounded-md border border-dashed border-input px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-muted/40"
                >
                  <Plus className="size-3.5" /> Nueva plantilla
                </button>
                {tplList.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No se encontraron plantillas aprobadas para este número.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {tplList.map((t) => (
                      <button
                        key={`${t.name}-${t.language}`}
                        onClick={() => pickTemplate(t)}
                        className="flex flex-col items-start gap-0.5 rounded-md border border-input px-3 py-2 text-left transition hover:bg-muted/40"
                      >
                        <span className="text-sm font-medium">{t.name} <span className="text-xs font-normal text-muted-foreground">· {t.language}</span></span>
                        {t.bodyText && <span className="line-clamp-2 text-xs text-muted-foreground">{t.bodyText}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="rounded-md bg-muted/40 px-3 py-2 text-xs">
                  <span className="font-medium">{tplSel.name}</span> · {tplSel.language}
                  {tplSel.bodyText && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{tplSel.bodyText}</p>}
                </div>
                {tplParams.map((v, i) => (
                  <div key={i} className="flex flex-col gap-1.5">
                    <Label htmlFor={`tpl-${i}`}>Variable {`{{${i + 1}}}`}</Label>
                    <Input id={`tpl-${i}`} value={v} onChange={(e) => setTplParams((p) => p.map((x, j) => (j === i ? e.target.value : x)))} />
                  </div>
                ))}
                <button onClick={() => setTplSel(null)} className="self-start text-xs text-primary underline">← Volver a la lista</button>
              </div>
            )}
          </div>
          {tplSel && (
            <DialogFooter>
              <Button onClick={() => void sendTemplate()} disabled={extraSending}>{extraSending ? "Enviando…" : "Enviar plantilla"}</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {sessionId && (
        <TemplateBuilder
          sessionId={sessionId}
          open={tplBuilderOpen}
          onOpenChange={setTplBuilderOpen}
          onCreated={() => void openTemplate()}
        />
      )}

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Respuestas rápidas</DialogTitle>
          </DialogHeader>
          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            {draftReplies.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={r}
                  maxLength={1000}
                  placeholder="Escribe una respuesta rápida…"
                  onChange={(e) => setDraftReplies((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
                  className="text-xs"
                />
                <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => setDraftReplies((p) => p.filter((_, j) => j !== i))} title="Eliminar">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="self-start" onClick={() => setDraftReplies((p) => [...p, ""])}>
              <Plus className="mr-1 size-4" /> Agregar respuesta
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={saveManage}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
