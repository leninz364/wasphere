import type * as React from "react"

// Style options for the company name shown in the sidebar when the workspace
// has no logo. Keys are persisted in workspaces.name_style — keep them in sync
// with dashboard-api/src/workspaces/dto/update-branding.dto.ts.
export interface NameStyle {
  color?: string
  size?: string
  font?: string
}

export const NAME_SIZE_OPTIONS: { value: string; label: string; css: string }[] = [
  { value: "sm", label: "Pequeño", css: "1rem" },
  { value: "md", label: "Mediano", css: "1.25rem" },
  { value: "lg", label: "Grande", css: "1.5rem" },
  { value: "xl", label: "Extra grande", css: "1.875rem" },
]

export const NAME_FONT_OPTIONS: { value: string; label: string; css: string }[] = [
  { value: "sans", label: "Moderna", css: "ui-sans-serif, system-ui, sans-serif" },
  { value: "serif", label: "Clásica", css: "Georgia, 'Times New Roman', serif" },
  { value: "mono", label: "Monoespaciada", css: "ui-monospace, 'Cascadia Code', Consolas, monospace" },
  { value: "script", label: "Manuscrita", css: "'Segoe Script', 'Brush Script MT', cursive" },
  { value: "impact", label: "Impacto", css: "Impact, 'Arial Black', sans-serif" },
]

// Inline CSS for the sidebar name. Only sets what the user customized so the
// theme defaults (text-primary, text-xl) keep applying otherwise.
export function nameStyleCss(style?: NameStyle | null): React.CSSProperties {
  const css: React.CSSProperties = {}
  if (!style) return css
  if (style.color) css.color = style.color
  const size = NAME_SIZE_OPTIONS.find((s) => s.value === style.size)
  if (size) css.fontSize = size.css
  const font = NAME_FONT_OPTIONS.find((f) => f.value === style.font)
  if (font) css.fontFamily = font.css
  return css
}
