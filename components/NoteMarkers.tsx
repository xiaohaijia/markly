import { useLayoutEffect, useEffect, useRef, useState } from "react";
import { useGeometry } from "../lib/runtime/geometry-clock";
import { visibleClip } from "../lib/geometry";
import { bounds, resolveDrawing } from "../lib/drawing";
import type { Annotation } from "../lib/model";
import type { Tool } from "./DrawingLayer";

import { Icon } from "./Icon";
import s from "./Markly.module.css";
type NotePosition = { id: string; x: number; y: number; compact: boolean };
function Preview({ pos, note }: { pos: NotePosition; note: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const viewportWidth = innerWidth,
    viewportHeight = innerHeight;
  useLayoutEffect(() => {
    const el = ref.current!;
    const place = () => {
      const { width, height } = el.getBoundingClientRect();
      const right = pos.x + 26 + 8,
        left = pos.x - width - 8;
      const side =
        right + width <= viewportWidth - 8 ? right : left >= 8 ? left : null;
      const top =
        side !== null
          ? pos.y + 14 - height / 2
          : pos.y + 36 + height <= viewportHeight - 8
            ? pos.y + 36
            : pos.y - 8 - height;
      const cardLeft = Math.max(
        8,
        Math.min(side ?? pos.x, viewportWidth - width - 8),
      );
      const cardTop = Math.max(8, Math.min(top, viewportHeight - height - 8));
      el.style.left = cardLeft + "px";
      el.style.top = cardTop + "px";
      el.dataset.side =
        side === right ? "right" : side === left ? "left" : "vertical";
      el.style.setProperty(
        "--note-connector-y",
        Math.max(15, Math.min(height - 15, pos.y + 14 - cardTop)) + "px",
      );
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pos.x, pos.y, viewportWidth, viewportHeight, note]);
  return (
    <div
      ref={ref}
      className={s.notePreview}
      role="tooltip"
      id={"markly-preview-" + pos.id}
    >
      <div className={s.previewLabel}>
        <Icon name="note" size={13} />
        <span>备注</span>
      </div>
      <div className={s.previewBody}>
        <p>{note}</p>
      </div>
    </div>
  );
}
function locateNotes(
  annotations: Annotation[],
  ranges: Map<string, Range>,
): NotePosition[] {
  const positions: NotePosition[] = [];
  for (const a of annotations) {
    if (!a.note || (a.kind === "page" && !a.position)) continue;
    let left: number, top: number, bottom: number;
    if (a.kind === "text") {
      const range = ranges.get(a.id);
      const r = range?.getBoundingClientRect();
      const element = range?.startContainer.parentElement;
      if (!r || !element) continue;
      const clip = visibleClip(element);
      if (
        r.bottom < clip.y ||
        r.top > clip.y + clip.height ||
        r.right < clip.x ||
        r.left > clip.x + clip.width
      )
        continue;
      left =
        element
          .closest("p,li,blockquote,h1,h2,h3,h4,td,pre")
          ?.getBoundingClientRect().left ?? r.left;
      top = r.top;
      bottom = r.bottom;
    } else {
      const resolved = resolveDrawing(
        a.kind === "page" ? a.position! : a.drawing,
      );
      if (!resolved.points.length) continue;
      const box = bounds(resolved.points);
      left = box.x;
      top = box.y;
      bottom = box.y + box.height;
      if (
        resolved.clip &&
        (box.x < resolved.clip.x ||
          box.x > resolved.clip.x + resolved.clip.width ||
          bottom < resolved.clip.y ||
          top > resolved.clip.y + resolved.clip.height)
      )
        continue;
    }
    if (a.kind === "page") {
      if (left < 0 || left > innerWidth || top < 0 || top > innerHeight)
        continue;
      positions.push({ id: a.id, x: left - 13, y: top - 14, compact: true });
      continue;
    }
    if (bottom < 20 || top > innerHeight - 40) continue;
    const y = top;
    const x = left - 30;
    if (y + 28 < 0 || y > innerHeight || x + 26 < 0 || x > innerWidth) continue;
    positions.push({ id: a.id, x, y, compact: true });
  }
  return positions;
}
export function NoteMarkers({
  annotations,
  ranges,
  hidden,
  tool,
  suppressPreview,
  onEdit,
}: {
  annotations: Annotation[];
  ranges: Map<string, Range>;
  hidden: boolean;
  suppressPreview: boolean;
  tool: Tool;
  onEdit: (a: Annotation) => void;
}) {
  useGeometry();
  const [hoverNote, setHoverNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function show(id: string) {
    clearTimeout(timer.current);
    setHoverNote(id);
  }
  function leave() {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHoverNote(null), 180);
  }
  useEffect(() => {
    if (suppressPreview || tool !== "pointer" || hidden) {
      clearTimeout(timer.current);
      setHoverNote(null);
    }
  }, [suppressPreview, tool, hidden]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHoverNote(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  const notePositions = hidden ? [] : locateNotes(annotations, ranges);
  return (
    <>
      {" "}
      {!hidden &&
        notePositions.map((pos) => {
          const a = annotations.find((a) => a.id === pos.id)!;
          return (
            <aside
              key={pos.id}
              className={`${s.sticky} ${pos.compact ? s.compactNote : ""}`}
              onMouseEnter={() => show(a.id)}
              onMouseLeave={leave}
              style={{
                left: pos.x,
                top: pos.y,
                pointerEvents: tool === "pointer" ? "auto" : "none",
              }}
            >
              {pos.compact ? (
                <>
                  <button
                    aria-describedby={
                      hoverNote === a.id &&
                      !suppressPreview &&
                      tool === "pointer"
                        ? "markly-preview-" + a.id
                        : undefined
                    }
                    aria-label="查看备注"
                    onClick={() => {
                      setHoverNote(null);
                      onEdit(a);
                    }}
                    onFocus={() => show(a.id)}
                    onBlur={leave}
                  >
                    <Icon name="note" size={16} />
                  </button>
                  {!suppressPreview &&
                    tool === "pointer" &&
                    hoverNote === a.id && <Preview pos={pos} note={a.note} />}
                </>
              ) : (
                <>
                  <strong>我的理解：</strong>
                  <p>{a.note}</p>
                </>
              )}
            </aside>
          );
        })}
    </>
  );
}
