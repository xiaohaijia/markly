import { z } from "zod";
export const COLORS = {
  yellow: "#F6D779",
  coral: "#ED9290",
  green: "#94AE98",
  blue: "#A5B9BD",
} as const;
export const INKS = {
  yellow: "#B88B24",
  coral: "#DD6565",
  green: "#64856D",
  blue: "#658A96",
} as const;
export type Color = keyof typeof COLORS;
const bounded = z.string().max(100000);
const point = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().min(0).max(1),
]);
export type Point = z.infer<typeof point>;
export const textAnchorSchema = z.object({
  exact: bounded.min(1),
  scope: z.string().max(10000).optional(),
  prefix: bounded,
  suffix: bounded,
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  path: z.string().max(4000),
  block: bounded,
  version: z.literal(1),
});
export type TextAnchor = z.infer<typeof textAnchorSchema>;
export const elementAnchorSchema = z.object({
  path: z.string().max(4000),
  tag: z.string().max(50),
  text: bounded,
  src: z.string().max(10000),
  width: z.number().positive(),
  height: z.number().positive(),
  identity: z.string().max(10000).optional(),
  scroll: z.tuple([z.number().finite(), z.number().finite()]).optional(),
});
export type ElementAnchor = z.infer<typeof elementAnchorSchema>;
export const drawingSchema = z.object({
  tool: z.enum(["pen", "rect", "ellipse", "arrow", "text"]),
  coordinateSpace: z.literal("element-content-v2").optional(),
  points: z.array(point).min(1).max(20000),
  text: z.string().max(10000).optional(),
  element: elementAnchorSchema.optional(),
  origin: z.tuple([z.number().finite(), z.number().finite()]),
  viewport: z.tuple([z.number().positive(), z.number().positive()]),
});
export type Drawing = z.infer<typeof drawingSchema>;
export const pageSchema = z.object({
  id: z.string().max(10000),
  url: z
    .string()
    .max(10000)
    .refine((v) => /^(https?:|file:)\/\//.test(v)),
  title: z.string().max(2000),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
});
export type PageRecord = z.infer<typeof pageSchema>;
const base = {
  id: z.string().uuid(),
  pageId: z.string().max(10000),
  color: z.enum(["yellow", "coral", "green", "blue"]),
  note: bounded,
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  version: z.literal(1),
};
export const annotationSchema = z.discriminatedUnion("kind", [
  z.object({
    ...base,
    kind: z.literal("text"),
    style: z.enum(["highlight", "underline", "strike"]),
    anchor: textAnchorSchema,
  }),
  z.object({ ...base, kind: z.literal("drawing"), drawing: drawingSchema }),
  z.object({
    ...base,
    kind: z.literal("page"),
    position: drawingSchema.optional(),
  }),
]);
export type Annotation = z.infer<typeof annotationSchema>;
export type TextAnnotation = Extract<Annotation, { kind: "text" }>;
export const backupSchema = z.object({
  format: z.literal("markly"),
  version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  exportedAt: z.number(),
  pages: z.array(pageSchema).max(50000),
  annotations: z.array(annotationSchema).max(100000),
});
export type Backup = z.infer<typeof backupSchema>;
export function pageKey(url: string) {
  const u = new URL(url);
  if (!["http:", "https:", "file:"].includes(u.protocol))
    throw new Error("此页面不支持批注");
  return u.href;
}
export function newBase(pageId: string, color: Color) {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    pageId,
    color,
    note: "",
    createdAt: now,
    updatedAt: now,
    version: 1 as const,
  };
}
export const requestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("list"), page: pageSchema }),
  z.object({
    type: z.literal("save"),
    page: pageSchema,
    annotation: annotationSchema,
    opId: z.string().uuid(),
    expectedUpdatedAt: z.number().nullable().optional(),
  }),
  z.object({
    type: z.literal("delete"),
    pageId: z.string(),
    id: z.string().uuid(),
    opId: z.string().uuid(),
    expectedUpdatedAt: z.number().nullable().optional(),
  }),
  z.object({
    type: z.literal("clear-page"),
    pageId: z.string(),
    opId: z.string().uuid(),
  }),
  z.object({ type: z.literal("all") }),
  z.object({ type: z.literal("export") }),
  z.object({ type: z.literal("import"), backup: backupSchema }),
  z.object({ type: z.literal("history") }),
  z.object({ type: z.literal("enable-site"), origin: z.string() }),
  z.object({ type: z.literal("disable-site"), origin: z.string() }),
]);
export type Request = z.infer<typeof requestSchema>;
export type Reply = { ok: true; data: unknown } | { ok: false; error: string };
export { rpc } from "./runtime/rpc";
