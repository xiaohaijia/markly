import { beforeEach, expect, it, vi } from "vitest";
import { drawingElement, finishDrawing, resolveDrawing } from "../lib/drawing";
import { invalidateContent } from "../lib/runtime/content-clock";
import { drawingSchema } from "../lib/model";
function rect(el: Element, left = 10, top = 20, width = 400, height = 300) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON() {},
  });
}
beforeEach(() => {
  document.body.innerHTML = "";
  invalidateContent();
});
it("tracks the anchor's internal scroll after serialization and refresh", () => {
  document.body.innerHTML = '<div id="scroll">Stable content</div>';
  const el = document.querySelector("div")!;
  rect(el);
  el.scrollTop = 30;
  const d = drawingSchema.parse(
    finishDrawing(
      "rect",
      [
        [30, 50, 0.5],
        [60, 80, 0.5],
      ],
      el,
    ),
  );
  el.scrollTop = 90;
  expect(resolveDrawing(d).points[0]).toEqual([30, -10, 0.5]);
  rect(el, 10, 120);
  expect(resolveDrawing(d).points[0]).toEqual([30, 90, 0.5]);
});
it("keeps a live anchor when sibling insertion changes its CSS path", () => {
  document.body.innerHTML = "<p>original</p>";
  const el = document.querySelector("p")!;
  rect(el);
  const d = finishDrawing(
    "rect",
    [
      [30, 50, 0.5],
      [60, 80, 0.5],
    ],
    el,
  );
  resolveDrawing(d);
  el.insertAdjacentHTML("beforebegin", "<p>different</p>");
  expect(resolveDrawing(d).points[0]).toEqual([30, 50, 0.5]);
});
it("uses the post permalink when counters change, but rejects a recycled post", () => {
  document.body.innerHTML =
    '<article><a href="https://x.com/test/status/123"><time>today</time></a><p>Post</p><span>1 like</span></article>';
  const el = document.querySelector("article")!;
  rect(el);
  const d = finishDrawing(
    "rect",
    [
      [30, 50, 0.5],
      [60, 80, 0.5],
    ],
    el,
  );
  el.querySelector("span")!.textContent = "2 likes";
  expect(resolveDrawing(d).points).toHaveLength(2);
  el.querySelector("a")!.href = "https://x.com/test/status/456";
  invalidateContent();
  expect(resolveDrawing(d).uncertain).toBe(true);
  expect(resolveDrawing(d).points).toHaveLength(0);
});
it("reattaches a temporarily removed element only to a unique match", () => {
  document.body.innerHTML = "<p>original</p>";
  const el = document.querySelector("p")!;
  rect(el);
  const d = finishDrawing(
    "rect",
    [
      [30, 50, 0.5],
      [60, 80, 0.5],
    ],
    el,
  );
  el.remove();
  invalidateContent();
  expect(resolveDrawing(d).uncertain).toBe(true);
  document.body.append(el);
  invalidateContent();
  rect(el, 10, 70);
  expect(resolveDrawing(d).points[0]).toEqual([30, 100, 0.5]);
});
it("loads older drawings without new optional anchor fields", () => {
  expect(
    drawingSchema.safeParse({
      tool: "pen",
      points: [[10, 20, 0.5]],
      origin: [0, 0],
      viewport: [1200, 800],
    }).success,
  ).toBe(true);
});

it("stores unscaled element content coordinates and follows transform scale changes", () => {
  document.body.innerHTML = "<p>scaled content</p>";
  const el = document.querySelector("p")!;
  Object.defineProperty(el, "offsetWidth", { value: 400 });
  Object.defineProperty(el, "offsetHeight", { value: 300 });
  rect(el, 10, 20, 200, 150);
  const d = finishDrawing(
    "rect",
    [
      [30, 50, 0.5],
      [60, 80, 0.5],
    ],
    el,
  );
  expect(d.coordinateSpace).toBe("element-content-v2");
  rect(el, 10, 20, 400, 300);
  expect(resolveDrawing(d).points[0]).toEqual([50, 80, 0.5]);
});

it("scopes shapes attached to a child of a recycled post", () => {
  document.body.innerHTML =
    '<article><a href="https://x.com/a/status/1"><time>today</time></a><p>Repeated words</p></article>';
  const el = document.querySelector("p")!;
  rect(el);
  const d = finishDrawing(
    "rect",
    [
      [30, 50, 0.5],
      [60, 80, 0.5],
    ],
    el,
  );
  expect(d.element?.identity).toBe("https://x.com/a/status/1");
  document.querySelector("a")!.href = "https://x.com/a/status/2";
  invalidateContent();
  expect(resolveDrawing(d).points).toHaveLength(0);
  expect(drawingElement(d)).toBeNull();
});
it("editing resolves the original live element after sibling insertion", () => {
  document.body.innerHTML = "<p>original</p>";
  const el = document.querySelector("p")!;
  rect(el);
  const d = finishDrawing(
    "rect",
    [
      [30, 50, 0.5],
      [60, 80, 0.5],
    ],
    el,
  );
  resolveDrawing(d);
  el.insertAdjacentHTML("beforebegin", "<p>wrong target</p>");
  expect(drawingElement(d)).toBe(el);
});

it("does not repeat identity text reads during geometry-only updates", () => {
  document.body.innerHTML = "<p>stable</p>";
  const el = document.querySelector("p")!;
  rect(el);
  const d = finishDrawing(
    "rect",
    [
      [30, 50, 0.5],
      [60, 80, 0.5],
    ],
    el,
  );
  const getter = vi.spyOn(el, "textContent", "get");
  for (let i = 0; i < 20; i++) resolveDrawing(d);
  expect(getter).toHaveBeenCalledTimes(1);
  invalidateContent();
  resolveDrawing(d);
  expect(getter).toHaveBeenCalledTimes(2);
  getter.mockRestore();
});
