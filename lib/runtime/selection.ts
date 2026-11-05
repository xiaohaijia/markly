import { captureText, editable } from "../anchor";
import type { TextAnchor } from "../model";
import { isPluginNode, openRoots } from "./dom";
export type SelectionSnapshot = {
  anchor: TextAnchor;
  x: number;
  y: number;
} | null;
function readRange(): Range | null {
  const selection = window.getSelection();
  if (selection?.rangeCount && !selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    if (range.toString().trim() && !isPluginNode(range.startContainer))
      return range.cloneRange();
  }
  for (const root of openRoots()) {
    if (!(root instanceof ShadowRoot)) continue;
    const sel = (
      root as ShadowRoot & { getSelection?(): Selection | null }
    ).getSelection?.();
    if (sel?.rangeCount && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      if (range.startContainer.getRootNode() === root)
        return range.cloneRange();
    }
  }
  return null;
}
export function observeSelection(publish: (value: SelectionSnapshot) => void) {
  let frame = 0,
    dragging = false,
    disposed = false;
  let previous: Range | null = null,
    anchor: TextAnchor | null = null;
  function update() {
    frame = 0;
    if (disposed || dragging || isPluginNode(document.activeElement)) return;
    const range = readRange();
    if (
      !range ||
      editable(range.startContainer) ||
      editable(range.endContainer)
    ) {
      previous = null;
      anchor = null;
      publish(null);
      return;
    }
    const r = range.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) {
      publish(null);
      return;
    }
    if (
      !previous ||
      previous.startContainer !== range.startContainer ||
      previous.startOffset !== range.startOffset ||
      previous.endContainer !== range.endContainer ||
      previous.endOffset !== range.endOffset ||
      previous.toString() !== range.toString()
    )
      anchor = captureText(range);
    previous = range;
    if (anchor?.exact.trim())
      publish({
        anchor,
        x: Math.max(8, Math.min(innerWidth - 420, r.left)),
        y: Math.max(8, Math.min(innerHeight - 62, r.bottom + 10)),
      });
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const down = (e: Event) => {
    if (!isPluginNode(e.composedPath()[0] as Node)) dragging = true;
  };
  const up = (e: Event) => {
    dragging = false;
    if (!isPluginNode(e.composedPath()[0] as Node)) schedule();
  };
  const listeners: [EventTarget, string, EventListener][] = [
    [window, "pointerdown", down],
    [window, "pointerup", up],
    [window, "mouseup", up],
    [document, "selectionchange", schedule],
    [window, "keyup", schedule],
    [window, "scroll", schedule],
  ];
  for (const [target, name, fn] of listeners)
    target.addEventListener(name, fn, true);
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    for (const [target, name, fn] of listeners)
      target.removeEventListener(name, fn, true);
  };
}
