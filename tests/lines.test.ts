import { expect, it } from "vitest";
import { linePath } from "../lib/lines";
import { backupSchema, newBase } from "../lib/model";
it("creates horizontal single and parallel double paths in either direction", () => {
  expect(linePath("line", [100, 20, 0.5], [10, 40, 0.5])).toBe("M10,20H100");
  expect(linePath("double", [100, 20, 0.5], [10, 40, 0.5])).toBe(
    "M10,17H100M10,23H100",
  );
});
it("creates a bounded regular wave from endpoints without sampling-dependent jitter", () => {
  const d = linePath("wave", [10, 20, 0.5], [82, 80, 0.5]);
  expect(d).toBe(linePath("wave", [82, 20, 0.5], [10, 80, 0.5]));
  const ys = Array.from(d.matchAll(/[,](\-?[\d.]+)/g), (m) => Number(m[1]));
  expect(Math.min(...ys)).toBeGreaterThanOrEqual(17);
  expect(Math.max(...ys)).toBeLessThanOrEqual(23);
  expect(d).toContain("82,20");
});
it("roundtrips all line styles through the versioned backup schema", () => {
  const page = {
    id: "https://example.com/",
    url: "https://example.com/",
    title: "Test",
    createdAt: 1,
    updatedAt: 1,
  };
  const annotations = ["line", "wave", "double"].map((tool) => ({
    ...newBase(page.id, "coral"),
    kind: "drawing",
    drawing: {
      tool,
      points: [
        [10, 20, 0.5],
        [82, 20, 0.5],
      ],
      origin: [0, 0],
      viewport: [1200, 800],
    },
  }));
  expect(
    backupSchema.parse({
      format: "markly",
      version: 5,
      exportedAt: 1,
      pages: [page],
      annotations,
    }).annotations,
  ).toHaveLength(3);
});
