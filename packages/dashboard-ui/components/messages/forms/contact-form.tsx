"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SAMPLE_CONTACT_NAME, SAMPLE_CONTACT_PHONE } from "@/lib/message-samples"

interface FormProps {
  onSubmit: (body: Record<string, unknown>) => Promise<void>
  submitting: boolean
  onClear?: () => void
}

export function ContactForm({ onSubmit, submitting }: FormProps) {
  const [displayName, setDisplayName] = React.useState("")
  const [phoneNumber, setPhoneNumber] = React.useState("")
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  const fillSample = () => {
    setDisplayName(SAMPLE_CONTACT_NAME)
    setPhoneNumber(SAMPLE_CONTACT_PHONE)
    setErrors({})
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!displayName.trim()) errs.displayName = "El nombre para mostrar es obligatorio."
    if (!phoneNumber.trim()) errs.phoneNumber = "El número de teléfono es obligatorio."
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setErrors({})
    await onSubmit({
      displayName: displayName.trim(),
      phoneNumber: phoneNumber.trim(),
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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact-name">Nombre para mostrar</Label>
        <Input
          id="contact-name"
          placeholder="Juan Pérez"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        {errors.displayName && (
          <p className="text-xs text-destructive">{errors.displayName}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact-phone">Número de teléfono</Label>
        <Input
          id="contact-phone"
          placeholder="+1 415 555 2671"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
        />
        {errors.phoneNumber && (
          <p className="text-xs text-destructive">{errors.phoneNumber}</p>
        )}
        <p className="text-xs text-muted-foreground">
          El servidor codifica el vCard automáticamente
        </p>
      </div>

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Enviando…" : "Enviar mensaje"}
      </Button>
    </form>
  )
}
