import { useLayoutEffect, useRef, useState, useEffect } from "react";
import { useGeometry } from "../lib/runtime/geometry-clock";
import { LINE_KINDS, LINE_LABELS, linePath, type LineKind } from "../lib/lines";
import type { Tool } from "./DrawingLayer";
import s from "./Markly.module.css";
export function LineIcon({
  kind = "line",
  width = 20,
}: {
  kind?: LineKind;
  width?: number;
}) {
  return (
    <svg
      width={width}
      height="20"
      viewBox="0 0 36 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={linePath(kind, [2, 10, 0.5], [34, 10, 0.5])}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function LineTool({
  tool,
  last,
  onChoose,
}: {
  tool: Tool;
  last: LineKind;
  onChoose: (kind: LineKind) => void;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null);
  const geometry = useGeometry();
  useLayoutEffect(() => {
    if (!open || !button.current || !menu.current) return;
    const b = button.current.getBoundingClientRect(),
      m = menu.current.getBoundingClientRect();
    menu.current.style.left = Math.max(8, b.left - m.width - 10) + "px";
    menu.current.style.top =
      Math.max(8, Math.min(b.top - 8, innerHeight - m.height - 8)) + "px";
  }, [open, geometry]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (
        !e
          .composedPath()
          .some((n) => n === button.current || n === menu.current)
      )
        setOpen(false);
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [open]);
  return (
    <>
      <button
        ref={button}
        aria-label="线条工具"
        data-tip="线条工具"
        aria-expanded={open}
        aria-pressed={LINE_KINDS.some((k) => k === tool)}
        aria-haspopup="menu"
        className={LINE_KINDS.some((k) => k === tool) ? s.active : ""}
        onClick={() => setOpen((v) => !v)}
      >
        <LineIcon kind={last} />
      </button>
      {open && (
        <div
          ref={menu}
          className={s.lineMenu}
          role="menu"
          aria-label="选择线条"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
              button.current?.focus();
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const items = Array.from(
                e.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
              );
              const index = items.indexOf(
                e.currentTarget.getRootNode() instanceof ShadowRoot
                  ? ((e.currentTarget.getRootNode() as ShadowRoot)
                      .activeElement as HTMLButtonElement)
                  : (document.activeElement as HTMLButtonElement),
              );
              items[
                (index + (e.key === "ArrowDown" ? 1 : -1) + 3) % 3
              ]?.focus();
            }
          }}
        >
          {LINE_KINDS.map((kind) => (
            <button
              autoFocus={last === kind}
              key={kind}
              role="menuitemradio"
              aria-checked={last === kind}
              onClick={() => {
                onChoose(kind);
                setOpen(false);
                button.current?.focus();
              }}
            >
              <LineIcon kind={kind} width={34} />
              <span>{LINE_LABELS[kind]}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
