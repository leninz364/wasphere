/**
 * Color for a customer rating on a red→amber→green scale.
 *   1 → red, 3 → amber, 5 → green.
 * Returns a CSS color string, or undefined for an unrated (null/0) value so the
 * caller can fall back to its default (muted) styling.
 */
export function ratingColor(value: number | null | undefined): string | undefined {
  if (!value || value <= 0) return undefined
  const clamped = Math.max(1, Math.min(5, value))
  const hue = ((clamped - 1) / 4) * 120 // 0 (red) → 120 (green)
  return `hsl(${Math.round(hue)} 72% 45%)`
}
