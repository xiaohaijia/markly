/** Shared by the inline editor and SVG text, including grapheme-safe soft wrapping. */
export const TEXT_FONT = "19px sans-serif";
let canvas: HTMLCanvasElement | undefined;
export function textLines(text: string, width?: number): string[] {
  if (!width) return text.split("\n");
  const context = (canvas ??= document.createElement("canvas")).getContext(
    "2d",
  );
  if (!context) return text.split("\n");
  context.font = TEXT_FONT;
  const result: string[] = [];
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const { segment } of segmenter.segment(paragraph)) {
      if (line && context.measureText(line + segment).width > width) {
        result.push(line);
        line = "";
      }
      line += segment;
    }
    result.push(line);
  }
  return result;
}

export function textWidth(text: string): number {
  const context = (canvas ??= document.createElement("canvas")).getContext(
    "2d",
  );
  if (!context) return 120;
  context.font = TEXT_FONT;
  return Math.max(
    ...text.split("\n").map((line) => context.measureText(line).width),
  );
}
