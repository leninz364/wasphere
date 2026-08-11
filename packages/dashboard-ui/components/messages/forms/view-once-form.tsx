"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SAMPLE_IMAGE_URL } from "@/lib/message-samples"

interface FormProps {
  onSubmit: (body: Record<string, unknown>) => Promise<void>
  submitting: boolean
  onClear?: () => void
}

export function ViewOnceForm({ onSubmit, submitting }: FormProps) {
  const [url, setUrl] = React.useState("")
  const [caption, setCaption] = React.useState("")
  const [error, setError] = React.useState("")

  const fillSample = () => {
    setUrl(SAMPLE_IMAGE_URL)
    setCaption("Imagen para ver una vez")
    setError("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) {
      setError("La URL del medio es obligatoria.")
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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="vo-url">URL del medio</Label>
        <Input
          id="vo-url"
          placeholder="https://example.com/photo.jpg"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">
          El servidor detecta automáticamente si es imagen o video. La subida nativa llega en la v1.1.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="vo-caption">
          Descripción{" "}
          <span className="text-muted-foreground font-normal">(opcional)</span>
        </Label>
        <Textarea
          id="vo-caption"
          placeholder="Descripción…"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={2}
        />
      </div>

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Enviando…" : "Enviar mensaje"}
      </Button>
    </form>
  )
}
