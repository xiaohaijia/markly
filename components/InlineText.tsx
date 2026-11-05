import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Annotation } from "../lib/model";
import { INKS } from "../lib/model";
import { resolveDrawing } from "../lib/drawing";
import { textLines, textWidth } from "../lib/text-layout";
import { useGeometry } from "../lib/runtime/geometry-clock";
import s from "./Markly.module.css";

type TextDrawing = Extract<Annotation, { kind: "drawing" }>;
export function InlineText({
  annotation,
  isNew,
  pending,
  error,
  onChange,
  onSave,
  onCancel,
  onRetry,
  onCopy,
}: {
  annotation: TextDrawing;
  isNew: boolean;
  pending: boolean;
  error: string;
  onChange: (text: string, width: number) => void;
  onSave: () => Promise<boolean>;
  onCancel: () => void;
  onRetry?: () => Promise<void>;
  onCopy: () => Promise<void>;
}) {
  useGeometry();
  const ref = useRef<HTMLTextAreaElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const saving = useRef(false);
  const latest = useRef({
    annotation,
    isNew,
    pending,
    error,
    onChange,
    onSave,
    onCancel,
    onRetry,
  });
  latest.current = {
    annotation,
    isNew,
    pending,
    error,
    onChange,
    onSave,
    onCancel,
    onRetry,
  };
  const [text, setText] = useState(annotation.drawing.text ?? "");
  const rawPoint = resolveDrawing(annotation.drawing).points[0];
  const x = rawPoint?.[0] ?? 12,
    y = rawPoint?.[1] ?? 32;
  const limit = Math.max(
    40,
    Math.min(
      annotation.drawing.textWidth ?? 280,
      innerWidth - Math.max(8, x) - 12,
    ),
  );
  const width = Math.min(
    limit,
    Math.max(30, textWidth(text || "输入文字…") + 2),
  );
  const lines = textLines(text, width);
  const display = lines.join("\n");
  useLayoutEffect(() => {
    const el = ref.current!;
    el.style.height =
      Math.min(
        Math.max(25, lines.length * 25),
        Math.max(50, innerHeight - 40),
      ) + "px";
  }, [display]);
  async function finish() {
    const v = latest.current;
    if (v.pending || saving.current || composing.current || v.error) return;
    if (!v.annotation.drawing.text?.trim()) {
      if (v.isNew) v.onCancel();
      return;
    }
    saving.current = true;
    try {
      await v.onSave();
    } finally {
      saving.current = false;
    }
  }
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!surface.current?.contains(e.composedPath()[0] as Node))
        void finish();
    };
    window.addEventListener("pointerdown", outside, true);
    return () => window.removeEventListener("pointerdown", outside, true);
  }, []);
  return (
    <div
      ref={surface}
      className={s.inlineSurface}
      style={{
        left: Math.max(8, Math.min(x, innerWidth - 52)),
        top: Math.max(8, Math.min(y - 19, innerHeight - 50)),
        width,
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.nativeEvent.isComposing || composing.current) return;
        if (e.key === "Escape") {
          e.preventDefault();
          if (!text.trim() && isNew) onCancel();
          else void finish();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          void finish();
        }
      }}
    >
      <textarea
        ref={ref}
        autoFocus
        aria-label="图中文字"
        placeholder="输入文字…"
        value={text}
        readOnly={pending}
        maxLength={10000}
        wrap="soft"
        style={{ color: INKS[annotation.color] }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value, limit);
        }}
        onBlur={(e) => {
          if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node))
            void finish();
        }}
      />
      {pending && <span className={s.inlineStatus}>保存中…</span>}
      {error && (
        <div className={s.inlineError} role="alert">
          {error}
          {error.includes("其他标签页") && (
            <button disabled={pending} onClick={() => void onCopy()}>
              另存一条
            </button>
          )}
          {onRetry && (
            <button disabled={pending} onClick={() => void onRetry()}>
              重试保存
            </button>
          )}
        </div>
      )}
      {!text.trim() && !isNew && (
        <div className={s.inlineStatus}>
          文字不能为空<button onClick={onCancel}>取消编辑</button>
        </div>
      )}
    </div>
  );
}
