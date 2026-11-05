import { useLayoutEffect, useRef, type ReactNode } from "react";
import { resolveDrawing } from "../lib/drawing";
import { useGeometry } from "../lib/runtime/geometry-clock";
import type { Annotation } from "../lib/model";

import { Icon } from "./Icon";
import s from "./Markly.module.css";

export function EditorSurface({
  annotation,
  panel,
  draft,
  children,
}: {
  annotation: Annotation;
  panel: boolean;
  draft: boolean;
  children: ReactNode;
}) {
  useGeometry();
  const ref = useRef<HTMLElement>(null);
  const pin =
    annotation.kind === "page" && annotation.position
      ? resolveDrawing(annotation.position).points[0]
      : undefined;
  const x = pin?.[0],
    y = pin?.[1];
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || x === undefined || y === undefined) return;
    const place = () => {
      const { width, height } = el.getBoundingClientRect();
      const left = x + 18 + width <= innerWidth - 8 ? x + 18 : x - width - 18;
      el.style.left =
        Math.max(8, Math.min(left, innerWidth - width - 8)) + "px";
      el.style.top =
        Math.max(8, Math.min(y - 14, innerHeight - height - 8)) + "px";
      el.style.right = "auto";
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => {
      ro.disconnect();
      el.style.left = "";
      el.style.top = "";
      el.style.right = "";
    };
  }, [x, y]);
  return (
    <>
      {draft && pin && (
        <span
          className={s.draftPin}
          aria-hidden="true"
          style={{ left: pin[0], top: pin[1] }}
        >
          <Icon name="note" size={15} />
        </span>
      )}
      <section
        ref={ref}
        className={s.editor + " " + s.paperEditor}
        data-panel={panel}
        aria-label="编辑备注"
      >
        {children}
      </section>
    </>
  );
}
