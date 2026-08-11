"use client"

import * as React from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  NAME_FONT_OPTIONS,
  NAME_SIZE_OPTIONS,
  nameStyleCss,
  type NameStyle,
} from "@/lib/name-style"

const MAX_BYTES = 500 * 1024 // 500 KB

export function LogoBrandingCard({
  initialLogo,
  initialName,
  initialNameStyle,
}: {
  initialLogo?: string | null
  initialName?: string | null
  initialNameStyle?: NameStyle | null
}) {
  const [logo, setLogo] = React.useState<string | null>(initialLogo ?? null)
  const [dirty, setDirty] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [name, setName] = React.useState(initialName ?? "")
  const [savingName, setSavingName] = React.useState(false)
  // "" = theme default for each style field
  const [color, setColor] = React.useState(initialNameStyle?.color ?? "")
  const [size, setSize] = React.useState(initialNameStyle?.size ?? "")
  const [font, setFont] = React.useState(initialNameStyle?.font ?? "")
  const [savingStyle, setSavingStyle] = React.useState(false)

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-selecting the same file
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast.error("Por favor elige un archivo de imagen (PNG, SVG, JPG, WebP).")
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error("El logo debe ser menor de 500 KB.")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setLogo(reader.result as string)
      setDirty(true)
    }
    reader.readAsDataURL(file)
  }

  async function save(value: string | null) {
    setSaving(true)
    try {
      const res = await fetch("/api/settings/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logo: value ?? "" }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(d.message ?? "No se pudo guardar el logo.")
        return
      }
      toast.success(value ? "Logo guardado — recarga para verlo en la barra lateral." : "Logo eliminado.")
      setDirty(false)
    } catch {
      toast.error("No se pudo comunicar con el servidor.")
    } finally {
      setSaving(false)
    }
  }

  async function saveName() {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error("El nombre de la empresa no puede estar vacío.")
      return
    }
    setSavingName(true)
    try {
      const res = await fetch("/api/settings/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(d.message ?? "No se pudo guardar el nombre.")
        return
      }
      toast.success("Nombre guardado — recarga para verlo en la barra lateral.")
    } catch {
      toast.error("No se pudo comunicar con el servidor.")
    } finally {
      setSavingName(false)
    }
  }

  async function saveStyle() {
    setSavingStyle(true)
    try {
      const res = await fetch("/api/settings/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nameColor: color, nameSize: size, nameFont: font }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(d.message ?? "No se pudo guardar el estilo.")
        return
      }
      toast.success("Estilo guardado — recarga para verlo en la barra lateral.")
    } catch {
      toast.error("No se pudo comunicar con el servidor.")
    } finally {
      setSavingStyle(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Marca</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Sube un logo personalizado que se muestre en la barra lateral del panel. PNG, SVG, JPG o WebP, hasta 500&nbsp;KB.
        </p>
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
            {logo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={logo} alt="Vista previa del logo" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-[10px] text-muted-foreground">Sin logo</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              Elegir imagen
            </Button>
            <Button type="button" size="sm" disabled={saving || !dirty || !logo} onClick={() => save(logo)}>
              {saving ? "Guardando…" : "Guardar logo"}
            </Button>
            {logo && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => { setLogo(null); save(null) }}
              >
                Eliminar
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t pt-4">
          <label htmlFor="company-name" className="text-sm font-medium">
            Nombre de la empresa
          </label>
          <p className="text-sm text-muted-foreground">
            Si no subes un logo, este nombre se muestra en grande en la barra lateral.
          </p>
          <div className="flex gap-2">
            <Input
              id="company-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej.: BRITEL"
              maxLength={60}
              className="max-w-xs"
            />
            <Button
              type="button"
              size="sm"
              disabled={savingName || !name.trim() || name.trim() === (initialName ?? "").trim()}
              onClick={saveName}
            >
              {savingName ? "Guardando…" : "Guardar nombre"}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t pt-4">
          <span className="text-sm font-medium">Estilo del nombre</span>
          <p className="text-sm text-muted-foreground">
            Personaliza el color, tamaño y fuente con que se muestra el nombre en la barra lateral.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name-color" className="text-xs text-muted-foreground">Color</label>
              <div className="flex items-center gap-1.5">
                <input
                  id="name-color"
                  type="color"
                  value={color || "#7c3aed"}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-8 w-12 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                />
                {color && (
                  <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setColor("")}>
                    Por defecto
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name-size" className="text-xs text-muted-foreground">Tamaño</label>
              <select
                id="name-size"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="">Por defecto</option>
                {NAME_SIZE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name-font" className="text-xs text-muted-foreground">Fuente</label>
              <select
                id="name-font"
                value={font}
                onChange={(e) => setFont(e.target.value)}
                className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="">Por defecto</option>
                {NAME_FONT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <Button type="button" size="sm" disabled={savingStyle} onClick={saveStyle}>
              {savingStyle ? "Guardando…" : "Guardar estilo"}
            </Button>
          </div>
          <div className="flex items-center justify-center rounded-md border bg-muted/40 px-3 py-4">
            <span
              className="break-words text-center text-xl font-bold leading-tight tracking-tight text-primary"
              style={nameStyleCss({ color: color || undefined, size, font })}
            >
              {name.trim() || "Nombre de la empresa"}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
