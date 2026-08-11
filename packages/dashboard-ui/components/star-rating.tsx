"use client"

import * as React from "react"
import { Star } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Star rating, 1–5. In editable mode, clicking a star sets that value; clicking
 * the current value again clears it (onChange(0)). In readOnly mode it only
 * displays. `value` of 0 means "not rated".
 */
export function StarRating({
  value,
  onChange,
  size = 20,
  readOnly = false,
  className,
  color,
}: {
  value: number
  onChange?: (v: number) => void
  size?: number
  readOnly?: boolean
  className?: string
  // Custom fill/stroke color for the filled stars (e.g. a score-based hue).
  // When omitted, filled stars use the default amber.
  color?: string
}) {
  const [hover, setHover] = React.useState(0)
  const shown = readOnly ? value : hover || value
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= shown
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            onClick={() => onChange?.(n === value ? 0 : n)}
            onMouseEnter={() => { if (!readOnly) setHover(n) }}
            onMouseLeave={() => { if (!readOnly) setHover(0) }}
            className={cn(
              "leading-none transition",
              readOnly ? "cursor-default" : "cursor-pointer hover:scale-110",
            )}
            aria-label={`${n} estrella${n === 1 ? "" : "s"}`}
          >
            <Star
              style={{
                width: size,
                height: size,
                ...(filled && color ? { color, fill: color } : {}),
              }}
              className={cn(
                filled
                  ? (color ? "" : "fill-amber-400 text-amber-400")
                  : "fill-transparent text-muted-foreground/40",
              )}
            />
          </button>
        )
      })}
    </div>
  )
}
