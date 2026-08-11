"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MediaInput } from "@/components/messages/media-input"
import { SAMPLE_VIDEO_URL } from "@/lib/message-samples"

interface FormProps {
  onSubmit: (body: Record<string, unknown>) => Promise<void>
  submitting: boolean
}

export function VideoForm({ onSubmit, submitting }: FormProps) {
  const [url, setUrl] = React.useState("")
  const [caption, setCaption] = React.useState("")
  const [error, setError] = React.useState("")

  const fillSample = () => {
    setUrl(SAMPLE_VIDEO_URL)
    setCaption("Video de ejemplo")
    setError("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) { setError("Se requiere una URL o archivo de video."); return }
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
        id="video-url" label="Video" value={url} onChange={setUrl}
        accept="video/mp4,video/3gpp,video/quicktime"
        urlPlaceholder="https://example.com/video.mp4" error={error}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="video-caption">
          Descripción <span className="text-muted-foreground font-normal">(opcional)</span>
        </Label>
        <Textarea id="video-caption" placeholder="Descripción del video…" value={caption}
          onChange={(e) => setCaption(e.target.value)} rows={2} />
      </div>
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Enviando…" : "Enviar mensaje"}
      </Button>
    </form>
  )
}
