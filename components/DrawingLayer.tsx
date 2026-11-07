import { useGeometry } from "../lib/runtime/geometry-clock";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  bounds,
  drawingElement,
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
import { isLine, linePath } from "../lib/lines";
import { textLines } from "../lib/text-layout";
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
  if (isLine(drawing.tool))
    return (
      <path
        data-line-kind={drawing.tool}
        d={linePath(drawing.tool, first, last)}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
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
        style={{ whiteSpace: "pre" }}
      >
        {textLines(drawing.text ?? "", drawing.textWidth).map((line, i) => (
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
/** Text points describe the baseline origin, never its painted dimensions. */
function TextSelectionBox({
  drawing,
  points,
}: {
  drawing: Drawing;
  points: Point[];
}) {
  const ref = useRef<SVGGElement>(null);
  const [box, setBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const revision = useGeometry();
  useLayoutEffect(() => {
    const text = ref.current?.parentElement?.querySelector("text");
    if (!text) {
      setBox(null);
      return;
    }
    const b = text.getBBox();
    const next = { x: b.x, y: b.y, width: b.width, height: b.height };
    setBox((old) =>
      old &&
      old.x === next.x &&
      old.y === next.y &&
      old.width === next.width &&
      old.height === next.height
        ? old
        : next,
    );
  }, [drawing, points, revision]);
  return (
    <g ref={ref} aria-hidden="true">
      {box && (
        <rect
          x={box.x - 6}
          y={box.y - 6}
          width={Math.max(1, box.width) + 12}
          height={Math.max(1, box.height) + 12}
          fill="transparent"
          stroke="#708970"
          strokeDasharray="4 3"
          style={{ pointerEvents: "none" }}
        />
      )}
    </g>
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
    geometry: string;
    pointerId: number;
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
    window.addEventListener("scroll", cancel, true);
    window.addEventListener("resize", cancel);
    return () => {
      window.removeEventListener("blur", cancel);
      window.removeEventListener("scroll", cancel, true);
      window.removeEventListener("resize", cancel);
    };
  }, []);
  const point = (e: React.PointerEvent): Point => [
    e.clientX,
    e.clientY,
    e.pressure || 0.5,
  ];
  function geometry(element: Element | null) {
    const r = element?.getBoundingClientRect();
    return JSON.stringify([
      scrollX,
      scrollY,
      innerWidth,
      innerHeight,
      r?.left,
      r?.top,
      r?.width,
      r?.height,
      element?.scrollLeft,
      element?.scrollTop,
    ]);
  }
  function down(e: React.PointerEvent<SVGSVGElement>) {
    if (tool === "pointer" || e.button !== 0 || !e.isPrimary || gesture.current)
      return;
    const p = point(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    const el = elementFor(p[0], p[1]);
    if (tool === "note") {
      gesture.current = {
        geometry: geometry(el),
        pointerId: e.pointerId,
        kind: "note",
        start: p,
        element: el,
        points: [p],
      };
      return;
    }
    if (tool === "text") {
      onText(p, el);
      return;
    }
    gesture.current = {
      geometry: geometry(el),
      pointerId: e.pointerId,
      kind: "draw",
      points: [p],
      element: el,
      start: p,
    };
    setDraft([p]);
  }
  function move(e: React.PointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointerId) return;
    if (geometry(g.element) !== g.geometry) {
      cancel();
      return;
    }
    const p = point(e);
    if (g.kind === "note") {
      if (Math.hypot(p[0] - g.start[0], p[1] - g.start[1]) > 5) cancel();
      return;
    }
    if (g.kind === "draw") {
      g.points =
        tool === "pen"
          ? g.points.length < 19999
            ? [...g.points, p]
            : g.points
          : [g.start, isLine(tool) ? [p[0], g.start[1], p[2]] : p];
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
  function up(e: React.PointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    // pointerup may carry a new final position with no preceding pointermove.
    move(e);
    if (!gesture.current) return;
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
          drawing: {
            ...finishDrawing(
              g.annotation.drawing.tool,
              g.points,
              g.element,
              g.annotation.drawing.text,
            ),
            textWidth: g.annotation.drawing.textWidth,
          },
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
    if (tool !== "pointer" || e.button !== 0 || !e.isPrimary || gesture.current)
      return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    onSelect(a.id);
    const el = drawingElement(a.drawing);
    if (a.drawing.element && !el) return;
    gesture.current = {
      geometry: geometry(el),
      pointerId: e.pointerId,
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
      onPointerCancel={(e) => {
        if (gesture.current?.pointerId === e.pointerId) cancel();
      }}
      onLostPointerCapture={(e) => {
        if (gesture.current?.pointerId === e.pointerId) cancel();
      }}
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
              {selected === a.id &&
                points.length > 0 &&
                a.drawing.tool === "text" && (
                  <TextSelectionBox drawing={a.drawing} points={points} />
                )}
              {selected === a.id && b && a.drawing.tool !== "text" && (
                <>
                  <rect
                    x={b.x - 6}
                    y={isLine(a.drawing.tool) ? b.y - 16 : b.y - 6}
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
