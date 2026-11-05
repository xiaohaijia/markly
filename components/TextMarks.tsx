import { useGeometry } from "../lib/runtime/geometry-clock";
import { visibleClip } from "../lib/geometry";
import type { Annotation } from "../lib/model";
import { COLORS, INKS } from "../lib/model";
import s from "./Markly.module.css";

// Geometry uses viewport coordinates, just like getClientRects and pointer events.
// Decorations live in our shadow root instead of relying on host highlight styles.
export function TextMarks({
  annotations,
  ranges,
  hidden,
}: {
  annotations: Annotation[];
  ranges: Map<string, Range>;
  hidden: boolean;
}) {
  useGeometry();
  if (hidden) return null;
  return (
    <svg
      className={s.drawing}
      style={{ pointerEvents: "none" }}
      aria-hidden="true"
      data-testid="text-marks"
    >
      {annotations.map((a) => {
        if (a.kind !== "text") return null;
        const range = ranges.get(a.id);
        if (
          !range?.startContainer.isConnected ||
          !range.endContainer.isConnected
        )
          return null;
        const element =
          range.commonAncestorContainer instanceof Element
            ? range.commonAncestorContainer
            : range.commonAncestorContainer.parentElement;
        const clip = element
          ? visibleClip(element)
          : { x: 0, y: 0, width: innerWidth, height: innerHeight };
        const { x: left, y: top } = clip,
          right = left + clip.width,
          bottom = top + clip.height;
        return (
          <g key={a.id} data-annotation={a.id}>
            {Array.from(range.getClientRects()).map((r, i) => {
              const x = Math.max(left, r.left),
                y = Math.max(top, r.top);
              const width = Math.min(right, r.right) - x,
                height = Math.min(bottom, r.bottom) - y;
              if (width <= 0 || height <= 0) return null;
              if (a.style === "highlight")
                return (
                  <rect
                    key={i}
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    fill={COLORS[a.color]}
                    opacity={0.32}
                  />
                );
              const lineY =
                a.style === "underline"
                  ? r.bottom - 1
                  : r.top + r.height * 0.55;
              return lineY >= top && lineY <= bottom ? (
                <line
                  key={i}
                  x1={x}
                  x2={x + width}
                  y1={lineY}
                  y2={lineY}
                  stroke={INKS[a.color]}
                  strokeWidth={2}
                />
              ) : null;
            })}
          </g>
        );
      })}
    </svg>
  );
}
