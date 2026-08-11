"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SAMPLE_LATITUDE, SAMPLE_LONGITUDE, SAMPLE_LOCATION_NAME, SAMPLE_LOCATION_ADDRESS } from "@/lib/message-samples"

interface FormProps {
  onSubmit: (body: Record<string, unknown>) => Promise<void>
  submitting: boolean
  onClear?: () => void
}

export function LocationForm({ onSubmit, submitting }: FormProps) {
  const [latitude, setLatitude] = React.useState("")
  const [longitude, setLongitude] = React.useState("")
  const [name, setName] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  const fillSample = () => {
    setLatitude(SAMPLE_LATITUDE)
    setLongitude(SAMPLE_LONGITUDE)
    setName(SAMPLE_LOCATION_NAME)
    setAddress(SAMPLE_LOCATION_ADDRESS)
    setErrors({})
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const lat = parseFloat(latitude)
    const lng = parseFloat(longitude)
    if (latitude.trim() === "" || isNaN(lat) || lat < -90 || lat > 90) {
      errs.latitude = "La latitud debe ser un número entre -90 y 90."
    }
    if (longitude.trim() === "" || isNaN(lng) || lng < -180 || lng > 180) {
      errs.longitude = "La longitud debe ser un número entre -180 y 180."
    }
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setErrors({})
    const body: Record<string, unknown> = { latitude: lat, longitude: lng }
    if (name.trim()) body.name = name.trim()
    if (address.trim()) body.address = address.trim()
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
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loc-lat">Latitud</Label>
          <Input
            id="loc-lat"
            type="number"
            min={-90}
            max={90}
            step="any"
            placeholder="51.5074"
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
          />
          {errors.latitude && (
            <p className="text-xs text-destructive">{errors.latitude}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loc-lng">Longitud</Label>
          <Input
            id="loc-lng"
            type="number"
            min={-180}
            max={180}
            step="any"
            placeholder="-0.1278"
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
          />
          {errors.longitude && (
            <p className="text-xs text-destructive">{errors.longitude}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="loc-name">
          Nombre{" "}
          <span className="text-muted-foreground font-normal">(opcional)</span>
        </Label>
        <Input
          id="loc-name"
          placeholder="Big Ben"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="loc-address">
          Dirección{" "}
          <span className="text-muted-foreground font-normal">(opcional)</span>
        </Label>
        <Input
          id="loc-address"
          placeholder="Westminster, London SW1A 0AA"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Enviando…" : "Enviar mensaje"}
      </Button>
    </form>
  )
}
