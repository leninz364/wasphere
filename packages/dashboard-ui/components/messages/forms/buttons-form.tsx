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
}

interface ButtonItem {
  id: string
  text: string
}

export function ButtonsForm({ onSubmit, submitting }: FormProps) {
  const [text, setText] = React.useState("")
  const [footer, setFooter] = React.useState("")
  const [buttons, setButtons] = React.useState<ButtonItem[]>([{ id: "", text: "" }])
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  const fillSample = () => {
    setText(SAMPLE_TEXT)
    setFooter("Con la tecnología de BChat")
    setButtons([
      { id: "opt_1", text: "Opción A" },
      { id: "opt_2", text: "Opción B" },
      { id: "opt_3", text: "Opción C" },
    ])
    setErrors({})
  }

  const addButton = () => {
    if (buttons.length < 3) {
      setButtons([...buttons, { id: "", text: "" }])
    }
  }

  const removeButton = (index: number) => {
    if (buttons.length > 1) {
      setButtons(buttons.filter((_, i) => i !== index))
    }
  }

  const updateButton = (index: number, field: keyof ButtonItem, value: string) => {
    setButtons(buttons.map((b, i) => (i === index ? { ...b, [field]: value } : b)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!text.trim()) errs.text = "El texto del cuerpo es obligatorio."
    if (!footer.trim()) errs.footer = "El pie de página es obligatorio."
    buttons.forEach((b, i) => {
      if (!b.id.trim()) errs[`btn_id_${i}`] = "El ID del botón es obligatorio."
      if (!b.text.trim()) errs[`btn_text_${i}`] = "El texto del botón es obligatorio."
    })
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setErrors({})
    await onSubmit({
      text: text.trim(),
      footer: footer.trim(),
      buttons: buttons.map((b) => ({ id: b.id.trim(), text: b.text.trim() })),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center justify-between pb-1">
        <span className="text-xs text-muted-foreground">Completa los campos a continuación</span>
        <Button type="button" size="xs" variant="outline" onClick={fillSample}>
          Rellenar ejemplo
        </Button>
      </div>
      <div className="rounded-lg border border-amber-400/40 bg-amber-50/60 dark:bg-amber-900/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
        WhatsApp descontinuó los botones interactivos para cuentas personales. Los destinatarios con versiones más recientes de WhatsApp podrían ver solo texto plano.
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="btn-text">Texto del cuerpo</Label>
          <span className="text-xs text-muted-foreground">{text.length}/1024</span>
        </div>
        <Textarea
          id="btn-text"
          placeholder="Cuerpo del mensaje…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1024}
          rows={3}
        />
        {errors.text && <p className="text-xs text-destructive">{errors.text}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="btn-footer">Pie de página</Label>
          <span className="text-xs text-muted-foreground">{footer.length}/60</span>
        </div>
        <Input
          id="btn-footer"
          placeholder="Texto del pie de página"
          value={footer}
          onChange={(e) => setFooter(e.target.value)}
          maxLength={60}
        />
        {errors.footer && (
          <p className="text-xs text-destructive">{errors.footer}</p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Label>Botones ({buttons.length}/3)</Label>
        {buttons.map((btn, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Botón {i + 1}
              </span>
              {buttons.length > 1 && (
                <Button
                  type="button"
                  size="xs"
                  variant="destructive"
                  onClick={() => removeButton(i)}
                >
                  Quitar
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`btn-id-${i}`} className="text-xs">
                  ID
                </Label>
                <Input
                  id={`btn-id-${i}`}
                  placeholder="btn_1"
                  value={btn.id}
                  onChange={(e) => updateButton(i, "id", e.target.value)}
                />
                {errors[`btn_id_${i}`] && (
                  <p className="text-xs text-destructive">
                    {errors[`btn_id_${i}`]}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`btn-text-${i}`} className="text-xs">
                  Texto
                </Label>
                <Input
                  id={`btn-text-${i}`}
                  placeholder="Haz clic"
                  value={btn.text}
                  onChange={(e) => updateButton(i, "text", e.target.value)}
                />
                {errors[`btn_text_${i}`] && (
                  <p className="text-xs text-destructive">
                    {errors[`btn_text_${i}`]}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addButton}
          disabled={buttons.length >= 3}
          className="w-fit"
        >
          + Agregar botón
        </Button>
      </div>

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Enviando…" : "Enviar mensaje"}
      </Button>
    </form>
  )
}
