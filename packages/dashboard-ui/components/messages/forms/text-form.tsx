"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SAMPLE_TEXT } from "@/lib/message-samples"

interface FormProps {
  onSubmit: (body: Record<string, unknown>) => Promise<void>
  submitting: boolean
  onClear?: () => void
  onTextChange?: (text: string) => void
}

const MAX_TEXT = 4096

export function TextForm({ onSubmit, submitting, onTextChange }: FormProps) {
  const [text, setText] = React.useState("")
  const [showReply, setShowReply] = React.useState(false)
  const [quotedId, setQuotedId] = React.useState("")
  const [error, setError] = React.useState("")

  const fillSample = () => {
    setText(SAMPLE_TEXT)
    onTextChange?.(SAMPLE_TEXT)
    setError("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) {
      setError("El texto del mensaje es obligatorio.")
      return
    }
    setError("")
    const body: Record<string, unknown> = { text: text.trim() }
    if (showReply && quotedId.trim()) {
      body.quotedId = quotedId.trim()
    }
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
        <div className="flex items-center justify-between">
          <Label htmlFor="text-body">Mensaje</Label>
          <span className="text-xs text-muted-foreground">
            {text.length}/{MAX_TEXT}
          </span>
        </div>
        <Textarea
          id="text-body"
          placeholder="Escribe tu mensaje…"
          value={text}
          onChange={(e) => { setText(e.target.value); onTextChange?.(e.target.value) }}
          maxLength={MAX_TEXT}
          rows={3}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="show-reply"
          checked={showReply}
          onChange={(e) => setShowReply(e.target.checked)}
          className="size-4 rounded border-border accent-primary"
        />
        <Label htmlFor="show-reply" className="cursor-pointer font-normal">
          Responder a un mensaje
        </Label>
      </div>

      {showReply && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="quoted-id">ID del mensaje citado</Label>
          <Input
            id="quoted-id"
            placeholder="ID del mensaje a citar"
            value={quotedId}
            onChange={(e) => setQuotedId(e.target.value)}
          />
        </div>
      )}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Enviando…" : "Enviar mensaje"}
      </Button>
    </form>
  )
}
