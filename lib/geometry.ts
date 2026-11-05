import { parentElement } from "./runtime/dom";

export type Box = { x: number; y: number; width: number; height: number };
export function elementMetrics(element: Element) {
  const rect = element.getBoundingClientRect();
  const layoutWidth =
    element instanceof HTMLElement
      ? element.offsetWidth || rect.width
      : rect.width;
  const layoutHeight =
    element instanceof HTMLElement
      ? element.offsetHeight || rect.height
      : rect.height;
  return {
    rect,
    layoutWidth,
    layoutHeight,
    scaleX: layoutWidth ? rect.width / layoutWidth : 1,
    scaleY: layoutHeight ? rect.height / layoutHeight : 1,
  };
}
function fixedContainer(element: Element): Element | null {
  for (let el = parentElement(element); el; el = parentElement(el)) {
    const s = getComputedStyle(el);
    if (
      (s.transform && s.transform !== "none") ||
      (s.perspective && s.perspective !== "none") ||
      (s.filter && s.filter !== "none") ||
      /paint|layout|strict|content/.test(s.contain) ||
      /transform|perspective|filter/.test(s.willChange)
    )
      return el;
  }
  return null;
}
/** Compute clipping in viewport coordinates, respecting containing blocks. */
export function visibleClip(element: Element): Box {
  let left = 0,
    top = 0,
    right = innerWidth,
    bottom = innerHeight;
  let skipUntil: Element | null | undefined;
  for (let el: Element | null = element; el; el = parentElement(el)) {
    if (skipUntil !== undefined) {
      if (el !== skipUntil) continue;
      skipUntil = undefined;
    }
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden")
      return { x: 0, y: 0, width: 0, height: 0 };
    // Root/body overflow can be propagated to the viewport. Their border box
    // may be zero-height even while fixed descendants are visible.
    if (el !== document.documentElement && el !== document.body) {
      const { rect, scaleX, scaleY } = elementMetrics(el);
      const clipLeft = rect.left + el.clientLeft * scaleX;
      const clipTop = rect.top + el.clientTop * scaleY;
      const clipRight = el.clientWidth
        ? clipLeft + el.clientWidth * scaleX
        : rect.right;
      const clipBottom = el.clientHeight
        ? clipTop + el.clientHeight * scaleY
        : rect.bottom;
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX || style.overflow)) {
        left = Math.max(left, clipLeft);
        right = Math.min(right, clipRight);
      }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY || style.overflow)) {
        top = Math.max(top, clipTop);
        bottom = Math.min(bottom, clipBottom);
      }
    }
    if (style.position === "fixed") skipUntil = fixedContainer(el);
    else if (style.position === "absolute" && el instanceof HTMLElement)
      skipUntil = el.offsetParent;
  }
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}
