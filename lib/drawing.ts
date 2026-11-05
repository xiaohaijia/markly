import { hitElements, queryPath, queryAll, parentElement } from "./runtime/dom";
import { visibleClip, elementMetrics } from "./geometry";
import { getStroke } from "perfect-freehand";
import { cssPath, normalize, contentIdentity } from "./anchor";
import type { Drawing, Point, ElementAnchor } from "./model";
export function freehand(points: Point[]) {
  const stroke = getStroke(points, {
    size: 3.5,
    thinning: 0.35,
    smoothing: 0.7,
    streamline: 0.5,
    simulatePressure: true,
  });
  if (!stroke.length) return "";
  return "M " + stroke.map((p) => p.join(",")).join(" L ") + " Z";
}
export function bounds(points: Point[]) {
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}
function identity(el: Element): string | undefined {
  // A post permalink survives changing reaction counts and virtualized remounts.
  return contentIdentity(el);
}
export function elementFor(x: number, y: number): Element | null {
  return (
    hitElements(x, y).find(
      (e) =>
        !e.closest("markly-extension") &&
        e.matches("img,p,li,blockquote,h1,h2,h3,figure,article,section,div"),
    ) ?? null
  );
}
export function finishDrawing(
  tool: Drawing["tool"],
  points: Point[],
  candidate: Element | null,
  text?: string,
): Drawing {
  const box = bounds(points);
  // Find a content ancestor containing the entire gesture, not just its start.
  while (candidate && candidate !== document.body) {
    const r = candidate.getBoundingClientRect();
    if (
      r.width > 0 &&
      r.height > 0 &&
      box.x >= r.left - 12 &&
      box.y >= r.top - 12 &&
      box.x + box.width <= r.right + 12 &&
      box.y + box.height <= r.bottom + 12
    )
      break;
    candidate = parentElement(candidate);
  }
  if (candidate === document.body || candidate === document.documentElement)
    candidate = null;
  const r = candidate?.getBoundingClientRect();
  let element: ElementAnchor | undefined;
  if (
    candidate &&
    r &&
    r.width > 0 &&
    r.height > 0 &&
    box.x >= r.left - 12 &&
    box.y >= r.top - 12 &&
    box.x + box.width <= r.right + 12 &&
    box.y + box.height <= r.bottom + 12
  ) {
    const metrics = elementMetrics(candidate);
    element = {
      path: cssPath(candidate),
      identity: identity(candidate),
      tag: candidate.tagName,
      text: normalize(candidate.textContent ?? "").slice(0, 2000),
      src:
        candidate instanceof HTMLImageElement
          ? candidate.src || candidate.currentSrc
          : "",
      width: metrics.layoutWidth,
      height: metrics.layoutHeight,
      scroll: [candidate.scrollLeft, candidate.scrollTop],
    };
    points = points.map(([x, y, p]) => [
      (x - r.left) / metrics.scaleX + candidate!.scrollLeft,
      (y - r.top) / metrics.scaleY + candidate!.scrollTop,
      p,
    ]);
  } else
    points = points.map(([x, y, p]) => [
      x + window.scrollX,
      y + window.scrollY,
      p,
    ]);
  return {
    tool,
    coordinateSpace: element ? "element-content-v2" : undefined,
    points,
    text,
    element,
    origin: [window.scrollX, window.scrollY],
    viewport: [innerWidth, innerHeight],
  };
}
const liveAnchors = new WeakMap<Drawing, Element>();
/** Editing and painting must use the same identity-validated element. */
export function drawingElement(d: Drawing): Element | null {
  if (!d.element) return null;
  let el: Element | null = liveAnchors.get(d) ?? null;
  try {
    if (!el?.isConnected) el = queryPath(d.element.path);
  } catch {}
  const valid = (e: Element) =>
    e.tagName === d.element!.tag &&
    (d.element!.identity
      ? identity(e) === d.element!.identity
      : d.element!.src
        ? e instanceof HTMLImageElement &&
          (e.src === d.element!.src || e.currentSrc === d.element!.src)
        : normalize(e.textContent ?? "").slice(0, 2000) === d.element!.text);
  if (!el || !valid(el)) {
    const candidates = queryAll(d.element.tag).filter(valid);
    el = candidates.length === 1 ? candidates[0]! : null;
  }
  if (!el) return null;
  liveAnchors.set(d, el);
  return el;
}
export function resolveDrawing(d: Drawing): {
  points: Point[];
  uncertain: boolean;
  clip?: ReturnType<typeof visibleClip>;
} {
  if (!d.element)
    return {
      points: d.points.map(([x, y, p]) => [x - scrollX, y - scrollY, p]),
      uncertain: Math.abs(innerWidth / d.viewport[0] - 1) > 0.15,
    };
  const el = drawingElement(d);
  if (!el) return { points: [], uncertain: true };
  const metrics = elementMetrics(el);
  const r = metrics.rect;
  if (!r.width || !r.height) return { points: [], uncertain: true };
  const modern = d.coordinateSpace === "element-content-v2";
  const sx = (modern ? metrics.layoutWidth : r.width) / d.element.width;
  const sy = (modern ? metrics.layoutHeight : r.height) / d.element.height;
  const image = el instanceof HTMLImageElement;
  return {
    points: modern
      ? d.points.map(([x, y, p]) => [
          r.left + (x * (image ? sx : 1) - el.scrollLeft) * metrics.scaleX,
          r.top + (y * (image ? sy : 1) - el.scrollTop) * metrics.scaleY,
          p,
        ])
      : d.points.map(([x, y, p]) => [
          r.left +
            x * (image ? sx : 1) -
            (el.scrollLeft - (d.element!.scroll?.[0] ?? 0)),
          r.top +
            y * (image ? sy : 1) -
            (el.scrollTop - (d.element!.scroll?.[1] ?? 0)),
          p,
        ]),
    clip: visibleClip(el),
    uncertain: !image && (Math.abs(sx - 1) > 0.1 || Math.abs(sy - 1) > 0.1),
  };
}
