"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MediaInput } from "@/components/messages/media-input"
import { SAMPLE_GIF_URL } from "@/lib/message-samples"

interface FormProps {
  onSubmit: (body: Record<string, unknown>) => Promise<void>
  submitting: boolean
}

export function GifForm({ onSubmit, submitting }: FormProps) {
  const [url, setUrl] = React.useState("")
  const [caption, setCaption] = React.useState("")
  const [error, setError] = React.useState("")

  const fillSample = () => {
    setUrl(SAMPLE_GIF_URL)
    setCaption("Animado vía BChat")
    setError("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) { setError("Se requiere una URL o archivo de GIF."); return }
    const trimmed = url.trim()
    const isGifExt = /\.gif(\?.*)?$/i.test(trimmed.split("#")[0])
    if (isGifExt) {
      setError("Los archivos .gif sin procesar no se animan en WhatsApp. Usa una URL MP4 o WebM. Giphy ofrece versiones MP4: abre el GIF en giphy.com, haz clic en Compartir → Copiar enlace y reemplaza /giphy.gif por /giphy.mp4")
      return
    }
    setError("")
    const body: Record<string, unknown> = { url: url.trim() }
    if (caption.trim()) body.caption = caption.trim()
    await onSubmit(body)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center justify-between pb-1">
        <span className="text-xs text-muted-foreground">Completa los campos a continuación</span>
        <Button type="button" size="xs" variant="outline" onClick={fillSample}>
          Rellenar ejemplo
        </Button>
      </div>
      <MediaInput
        id="gif-url" label="GIF / Animación" value={url} onChange={setUrl}
        accept="video/mp4,image/gif"
        urlPlaceholder="https://example.com/animation.mp4" error={error}
      />
      <p className="text-xs text-muted-foreground -mt-2">Debe ser <strong>MP4 o WebM</strong> — los archivos .gif sin procesar no se animan en WhatsApp.</p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gif-caption">
          Descripción <span className="text-muted-foreground font-normal">(opcional)</span>
        </Label>
        <Textarea id="gif-caption" placeholder="Descripción…" value={caption}
          onChange={(e) => setCaption(e.target.value)} rows={2} />
      </div>
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Enviando…" : "Enviar mensaje"}
      </Button>
    </form>
  )
}
