import { expect, it, vi } from "vitest";
import { visibleClip } from "../lib/geometry";
import { queryPath } from "../lib/runtime/dom";
import { withDeadline } from "../lib/runtime/rpc";

it("does not clip fixed descendants to a zero-height wrapper or body", () => {
  document.body.innerHTML =
    '<div style="overflow:hidden;height:0"><p style="position:fixed">visible content</p></div>';
  document.body.style.overflow = "hidden";
  const clip = visibleClip(document.querySelector("p")!);
  expect(clip.width).toBe(innerWidth);
  expect(clip.height).toBe(innerHeight);
  document.body.removeAttribute("style");
});
it("resolves a path across two shadow boundaries", () => {
  document.body.innerHTML = '<outer-card id="outer"></outer-card>';
  const outer = document
    .querySelector("outer-card")!
    .attachShadow({ mode: "open" });
  outer.innerHTML = "<inner-card></inner-card>";
  const inner = outer
    .querySelector("inner-card")!
    .attachShadow({ mode: "open" });
  inner.innerHTML = "<p>Nested</p>";
  expect(queryPath("#outer >>> inner-card >>> p")).toBe(
    inner.querySelector("p"),
  );
});
it("times out an unresponsive background request instead of leaving saving locked", async () => {
  vi.useFakeTimers();
  try {
    const result = withDeadline(new Promise<never>(() => {}), 15000);
    const assertion = expect(result).rejects.toThrow("后台确认超时");
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
it("clears the deadline when a request succeeds", async () => {
  vi.useFakeTimers();
  try {
    expect(await withDeadline(Promise.resolve("saved"), 15000)).toBe("saved");
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it("accepts old and new backup versions and preserves versioned coordinates", async () => {
  const { backupSchema, newBase } = await import("../lib/model");
  const page = {
    id: "https://example.com/",
    url: "https://example.com/",
    title: "Test",
    createdAt: 1,
    updatedAt: 1,
  };
  const annotation = {
    ...newBase(page.id, "coral"),
    kind: "drawing",
    drawing: {
      tool: "rect",
      coordinateSpace: "element-content-v2",
      points: [
        [10, 20, 0.5],
        [40, 50, 0.5],
      ],
      origin: [0, 0],
      viewport: [1200, 800],
    },
  };
  const backup = {
    format: "markly",
    version: 2,
    exportedAt: 1,
    pages: [page],
    annotations: [annotation],
  };
  expect(backupSchema.parse(backup).annotations[0]).toMatchObject({
    drawing: { coordinateSpace: "element-content-v2" },
  });
  expect(
    backupSchema.safeParse({ ...backup, version: 1, annotations: [] }).success,
  ).toBe(true);
  expect(
    backupSchema.parse({
      ...backup,
      version: 3,
      annotations: [
        {
          ...newBase(page.id, "yellow"),
          kind: "page",
          note: "pin",
          position: {
            ...annotation.drawing,
            tool: "text",
            points: [[10, 20, 0.5]],
          },
        },
      ],
    }).annotations[0],
  ).toMatchObject({ kind: "page", position: { points: [[10, 20, 0.5]] } });
  expect(backupSchema.safeParse({ ...backup, version: 4 }).success).toBe(false);
});
