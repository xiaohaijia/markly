import type { Point } from "./model";
export const LINE_KINDS = ["line", "wave", "double"] as const;
export type LineKind = (typeof LINE_KINDS)[number];
export const LINE_LABELS = { line: "横线", wave: "波浪线", double: "双横线" };
export function isLine(tool: string): tool is LineKind {
  return (LINE_KINDS as readonly string[]).includes(tool);
}
/** Horizontal guides are deterministic paths, independent of pointer sampling speed. */
export function linePath(kind: LineKind, start: Point, end: Point): string {
  const x = Math.min(start[0], end[0]),
    right = Math.max(start[0], end[0]),
    y = start[1];
  if (kind === "line") return `M${x},${y}H${right}`;
  if (kind === "double")
    return `M${x},${y - 3}H${right}M${x},${y + 3}H${right}`;
  const length = right - x;
  if (!length) return `M${x},${y}`;
  const steps = Math.min(10000, Math.max(1, Math.ceil(length / 6)));
  const amplitude = 2.5,
    k = Math.PI / 6;
  const rounded = (n: number) => String(Math.round(n * 1000) / 1000);
  let d = "M" + x + "," + y;
  for (let i = 1; i <= steps; i++) {
    const a = (length * (i - 1)) / steps,
      b = (length * i) / steps,
      third = (b - a) / 3;
    const control1 =
      y + amplitude * Math.sin(k * a) + amplitude * k * Math.cos(k * a) * third;
    const control2 =
      y + amplitude * Math.sin(k * b) - amplitude * k * Math.cos(k * b) * third;
    d +=
      "C" +
      rounded(x + a + third) +
      "," +
      rounded(control1) +
      " " +
      rounded(x + b - third) +
      "," +
      rounded(control2) +
      " " +
      rounded(x + b) +
      "," +
      rounded(y + amplitude * Math.sin(k * b));
  }
  return d;
}
