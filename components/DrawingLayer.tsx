import { useGeometry } from "../lib/runtime/geometry-clock";
import { queryPath } from "../lib/runtime/dom";
import { useEffect, useRef, useState } from "react";
import {
  bounds,
  elementFor,
  finishDrawing,
  freehand,
  resolveDrawing,
} from "../lib/drawing";
import {
  INKS,
  type Annotation,
  type Color,
  type Drawing,
  type Point,
} from "../lib/model";
import s from "./Markly.module.css";
export type Tool = "pointer" | "note" | Drawing["tool"];
export function Shape({
  drawing,
  points,
  color,
}: {
  drawing: Drawing;
  points: Point[];
  color: string;
}) {
  if (!points.length) return null;
  const first = points[0]!,
    last = points.at(-1)!;
  const box = bounds(points);
  if (drawing.tool === "pen") return <path d={freehand(points)} fill={color} />;
  if (drawing.tool === "rect")
    return (
      <rect {...box} fill="transparent" stroke={color} strokeWidth="2" rx="2" />
    );
  if (drawing.tool === "ellipse")
    return (
      <ellipse
        cx={box.x + box.width / 2}
        cy={box.y + box.height / 2}
        rx={Math.max(1, box.width / 2)}
        ry={Math.max(1, box.height / 2)}
        fill="transparent"
        stroke={color}
        strokeWidth="2"
      />
    );
  if (drawing.tool === "text")
    return (
      <text
        x={first[0]}
        y={first[1]}
        fill={color}
        fontSize="19"
        fontFamily="sans-serif"
      >
        {drawing.text?.split("\n").map((line, i) => (
          <tspan key={i} x={first[0]} dy={i ? 25 : 0}>
            {line || " "}
          </tspan>
        ))}
      </text>
    );
  const angle = Math.atan2(last[1] - first[1], last[0] - first[0]),
    size = 12;
  return (
    <path
      d={`M${first[0]},${first[1]} L${last[0]},${last[1]} M${last[0] - size * Math.cos(angle - 0.45)},${last[1] - size * Math.sin(angle - 0.45)} L${last[0]},${last[1]} L${last[0] - size * Math.cos(angle + 0.45)},${last[1] - size * Math.sin(angle + 0.45)}`}
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}
export function DrawingLayer({
  annotations,
  tool,
  color,
  hidden,
  selected,
  onSelect,
  onCreate,
  onUpdate,
  onText,
  onNote,
  onEdit,
}: {
  annotations: Annotation[];
  tool: Tool;
  color: Color;
  hidden: boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (drawing: Drawing) => void;
  onUpdate: (a: Annotation) => void;
  onText: (point: Point, el: Element | null) => void;
  onNote: (point: Point, el: Element | null) => void;
  onEdit: (a: Annotation) => void;
}) {
  useGeometry();
  const [draft, setDraft] = useState<Point[]>([]);
  const gesture = useRef<{
    kind: "note" | "draw" | "move" | "resize";
    points: Point[];
    element: Element | null;
    annotation?: Extract<Annotation, { kind: "drawing" }>;
    start: Point;
    rendered?: Point[];
  } | null>(null);
  const [preview, setPreview] = useState<{
    id: string;
    points: Point[];
  } | null>(null);
  const cancel = () => {
    gesture.current = null;
    setDraft([]);
    setPreview(null);
  };
  useEffect(() => {
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  }, []);
  const point = (e: React.PointerEvent): Point => [
    e.clientX,
    e.clientY,
    e.pressure || 0.5,
  ];
  function down(e: React.PointerEvent<SVGSVGElement>) {
    if (tool === "pointer" || e.button !== 0) return;
    const p = point(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    const el = elementFor(p[0], p[1]);
    if (tool === "note") {
      gesture.current = { kind: "note", start: p, element: el, points: [p] };
      return;
    }
    if (tool === "text") {
      onText(p, el);
      return;
    }
    gesture.current = { kind: "draw", points: [p], element: el, start: p };
    setDraft([p]);
  }
  function move(e: React.PointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (!g) return;
    const p = point(e);
    if (g.kind === "note") {
      if (Math.hypot(p[0] - g.start[0], p[1] - g.start[1]) > 5) cancel();
      return;
    }
    if (g.kind === "draw") {
      g.points = tool === "pen" ? [...g.points.slice(-19998), p] : [g.start, p];
      setDraft(g.points);
    } else if (g.annotation && g.rendered) {
      const dx = p[0] - g.start[0],
        dy = p[1] - g.start[1];
      let next: Point[];
      if (g.kind === "move")
        next = g.rendered.map(([x, y, pressure]) => [x + dx, y + dy, pressure]);
      else {
        const b = bounds(g.rendered);
        const sx = Math.max(4, b.width + dx) / Math.max(1, b.width),
          sy = Math.max(4, b.height + dy) / Math.max(1, b.height);
        next = g.rendered.map(([x, y, pressure]) => [
          b.x + (x - b.x) * sx,
          b.y + (y - b.y) * sy,
          pressure,
        ]);
      }
      g.points = next;
      setPreview({ id: g.annotation.id, points: next });
    }
  }
  function up() {
    const g = gesture.current;
    gesture.current = null;
    setDraft([]);
    setPreview(null);
    if (!g) return;
    if (g.kind === "note") {
      onNote(g.start, g.element);
      return;
    }
    if (g.kind === "draw") {
      if (g.points.length > 1) {
        const b = bounds(g.points);
        if (b.width + b.height > 3)
          onCreate(finishDrawing(tool as Drawing["tool"], g.points, g.element));
      }
    } else if (g.annotation && g.points.length) {
      const delta = g.points.some(
        (p, i) =>
          p[0] !== g.rendered?.[i]?.[0] || p[1] !== g.rendered?.[i]?.[1],
      );
      if (delta) {
        onUpdate({
          ...g.annotation,
          drawing: finishDrawing(
            g.annotation.drawing.tool,
            g.points,
            g.element,
            g.annotation.drawing.text,
          ),
        });
      }
    }
  }
  function startEdit(
    e: React.PointerEvent,
    a: Extract<Annotation, { kind: "drawing" }>,
    points: Point[],
    kind: "move" | "resize",
  ) {
    if (tool !== "pointer") return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    onSelect(a.id);
    let el: Element | null = null;
    try {
      if (a.drawing.element) el = queryPath(a.drawing.element.path);
    } catch {}
    gesture.current = {
      kind,
      points,
      rendered: points,
      annotation: a,
      element: el,
      start: point(e),
    };
  }
  if (hidden) return null;
  return (
    <svg
      data-testid="drawing-layer"
      className={s.drawing}
      style={{
        pointerEvents: tool === "pointer" ? "none" : "auto",
        cursor: tool === "pointer" ? "default" : "crosshair",
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
    >
      {annotations
        .filter(
          (a): a is Extract<Annotation, { kind: "drawing" }> =>
            a.kind === "drawing",
        )
        .map((a) => {
          const resolved = resolveDrawing(a.drawing);
          const points =
            preview?.id === a.id ? preview.points : resolved.points;
          const b = points.length ? bounds(points) : null;
          return (
            <g
              key={a.id}
              clipPath={resolved.clip ? `url(#clip-${a.id})` : undefined}
              opacity={resolved.uncertain ? 0.45 : 1}
              style={{
                pointerEvents:
                  tool === "pointer"
                    ? selected === a.id
                      ? "auto"
                      : a.drawing.tool === "text" || a.drawing.tool === "pen"
                        ? "visiblePainted"
                        : "stroke"
                    : "none",
                cursor: "move",
              }}
              onPointerDown={(e) => startEdit(e, a, points, "move")}
              onDoubleClick={() => onEdit(a)}
            >
              {resolved.clip && (
                <defs>
                  <clipPath id={`clip-${a.id}`}>
                    <rect {...resolved.clip} />
                  </clipPath>
                </defs>
              )}
              <Shape
                drawing={a.drawing}
                points={points}
                color={INKS[a.color]}
              />
              {tool === "pointer" && a.drawing.tool !== "text" && (
                <g className={s.shapeHit} aria-hidden="true">
                  <Shape
                    drawing={a.drawing}
                    points={points}
                    color="transparent"
                  />
                </g>
              )}
              {selected === a.id && b && (
                <>
                  <rect
                    x={b.x - 6}
                    y={b.y - 6}
                    width={Math.max(20, b.width) + 12}
                    height={Math.max(20, b.height) + 12}
                    fill="transparent"
                    stroke="#708970"
                    strokeDasharray="4 3"
                  />
                  {["rect", "ellipse"].includes(a.drawing.tool) && (
                    <rect
                      x={b.x + b.width - 5}
                      y={b.y + b.height - 5}
                      width="10"
                      height="10"
                      fill="white"
                      stroke="#708970"
                      style={{ cursor: "nwse-resize", pointerEvents: "auto" }}
                      onPointerDown={(e) => startEdit(e, a, points, "resize")}
                    />
                  )}
                </>
              )}
            </g>
          );
        })}
      {draft.length > 0 && (
        <Shape
          drawing={{
            tool: tool as Drawing["tool"],
            points: draft,
            origin: [0, 0],
            viewport: [innerWidth, innerHeight],
          }}
          points={draft}
          color={INKS[color]}
        />
      )}
    </svg>
  );
}
