import Dexie, { type Table } from "dexie";
import {
  backupSchema,
  type Annotation,
  type Backup,
  type PageRecord,
} from "./model";
export class MarklyDB extends Dexie {
  pages!: Table<PageRecord, string>;
  annotations!: Table<Annotation, string>;
  operations!: Table<{ id: string; at: number }, string>;
  constructor(name = "markly-v1") {
    super(name);
    this.version(1).stores({
      pages: "id,updatedAt",
      annotations: "id,pageId,updatedAt",
      operations: "id,at",
    });
  }
  async save(
    page: PageRecord,
    annotation: Annotation,
    opId: string,
    expectedUpdatedAt?: number | null,
  ) {
    if (annotation.pageId !== page.id) throw new Error("页面不匹配");
    await this.transaction(
      "rw",
      this.pages,
      this.annotations,
      this.operations,
      async () => {
        if (await this.operations.get(opId)) return;
        const old = await this.annotations.get(annotation.id);
        if (old && old.pageId !== page.id) throw new Error("标注不属于此页面");
        if (
          expectedUpdatedAt !== undefined &&
          (old?.updatedAt ?? null) !== expectedUpdatedAt
        )
          throw new Error("其他标签页已修改此标记，请重新打开编辑或另存一条");
        const previous = await this.pages.get(page.id);
        await this.pages.put({
          ...page,
          createdAt: previous?.createdAt ?? page.createdAt,
          updatedAt: Date.now(),
        });
        await this.annotations.put(annotation);
        await this.operations.put({ id: opId, at: Date.now() });
      },
    );
  }
  async remove(
    pageId: string,
    id: string,
    opId: string,
    expectedUpdatedAt?: number | null,
  ) {
    await this.transaction(
      "rw",
      this.annotations,
      this.operations,
      async () => {
        if (await this.operations.get(opId)) return;
        const old = await this.annotations.get(id);
        if (old && old.pageId !== pageId) throw new Error("标注不属于此页面");
        if (
          expectedUpdatedAt !== undefined &&
          (old?.updatedAt ?? null) !== expectedUpdatedAt
        )
          throw new Error("其他标签页已修改此标记，请重新打开编辑或另存一条");
        await this.annotations.delete(id);
        await this.operations.put({ id: opId, at: Date.now() });
      },
    );
  }
  async clearPage(pageId: string, opId: string) {
    await this.transaction(
      "rw",
      this.annotations,
      this.operations,
      async () => {
        if (await this.operations.get(opId)) return;
        await this.annotations.where("pageId").equals(pageId).delete();
        await this.operations.put({ id: opId, at: Date.now() });
      },
    );
  }
  async export(): Promise<Backup> {
    return this.transaction("r", this.pages, this.annotations, async () => ({
      format: "markly",
      version: 4,
      exportedAt: Date.now(),
      pages: await this.pages.toArray(),
      annotations: await this.annotations.toArray(),
    }));
  }
  async import(input: unknown) {
    const data = backupSchema.parse(input);
    const pageIds = new Set(data.pages.map((p) => p.id));
    if (
      data.pages.some((p) => p.id !== p.url) ||
      data.annotations.some((a) => !pageIds.has(a.pageId))
    )
      throw new Error("备份包含无效页面关联");
    if (
      new Set(data.annotations.map((a) => a.id)).size !==
        data.annotations.length ||
      pageIds.size !== data.pages.length
    )
      throw new Error("备份包含重复 ID");
    let added = 0,
      skipped = 0;
    await this.transaction("rw", this.pages, this.annotations, async () => {
      for (const page of data.pages)
        if (!(await this.pages.get(page.id))) await this.pages.add(page);
      for (const annotation of data.annotations) {
        const old = await this.annotations.get(annotation.id);
        if (old && stable(old) === stable(annotation)) {
          skipped++;
          continue;
        }
        await this.annotations.add(
          old ? { ...annotation, id: crypto.randomUUID() } : annotation,
        );
        added++;
      }
    });
    return { added, skipped };
  }
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + stable(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
