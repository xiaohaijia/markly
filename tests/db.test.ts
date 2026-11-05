import { describe, it, expect } from "vitest";
import { MarklyDB } from "../lib/db";
import { newBase, type Annotation, type PageRecord } from "../lib/model";
const page: PageRecord = {
  id: "https://example.com/",
  url: "https://example.com/",
  title: "Example",
  createdAt: 1,
  updatedAt: 1,
};
const note = (): Annotation => ({
  ...newBase(page.id, "yellow"),
  kind: "page",
  note: "important",
});
describe("database durability and backup", () => {
  it("clears only one page and deduplicates clear retries", async () => {
    const db = new MarklyDB(crypto.randomUUID());
    const other = { ...page, id: page.id + "other", url: page.url + "other" };
    await db.save(page, note(), crypto.randomUUID());
    const retained = { ...note(), pageId: other.id };
    await db.save(other, retained, crypto.randomUUID());
    const op = crypto.randomUUID();
    await db.clearPage(page.id, op);
    expect(await db.annotations.toArray()).toEqual([retained]);
    const fresh = note();
    await db.save(page, fresh, crypto.randomUUID());
    await db.clearPage(page.id, op);
    expect(await db.annotations.get(fresh.id)).toEqual(fresh);
    await db.delete();
  });
  it("deduplicates retries and persists after reopening", async () => {
    const name = "test-" + crypto.randomUUID(),
      db = new MarklyDB(name);
    const a = note(),
      op = crypto.randomUUID();
    await db.save(page, a, op);
    await db.save(page, { ...a, note: "retry should not change" }, op);
    expect(await db.annotations.count()).toBe(1);
    db.close();
    const next = new MarklyDB(name);
    expect((await next.annotations.get(a.id))?.note).toBe("important");
    await next.delete();
  });
  it("imports roundtrip, skips duplicates and preserves conflicting versions", async () => {
    const db = new MarklyDB(crypto.randomUUID());
    const a = note();
    await db.save(page, a, crypto.randomUUID());
    const backup = await db.export();
    expect(await db.import(backup)).toEqual({ added: 0, skipped: 1 });
    backup.annotations[0]!.note = "changed";
    expect(await db.import(backup)).toEqual({ added: 1, skipped: 0 });
    expect(await db.annotations.count()).toBe(2);
    await db.delete();
  });
  it("rejects invalid backup atomically", async () => {
    const db = new MarklyDB(crypto.randomUUID());
    const a = note();
    await expect(
      db.import({
        format: "markly",
        version: 1,
        exportedAt: 1,
        pages: [page],
        annotations: [{ ...a, pageId: "missing" }],
      }),
    ).rejects.toThrow();
    expect(await db.pages.count()).toBe(0);
    expect(await db.annotations.count()).toBe(0);
    await db.delete();
  });
  it("rejects cross-page overwrites and deletes", async () => {
    const db = new MarklyDB(crypto.randomUUID());
    const a = note();
    await db.save(page, a, crypto.randomUUID());
    await expect(
      db.remove("https://other/", a.id, crypto.randomUUID()),
    ).rejects.toThrow();
    await expect(
      db.save(
        { ...page, id: "https://other/", url: "https://other/" },
        { ...a, pageId: "https://other/" },
        crypto.randomUUID(),
      ),
    ).rejects.toThrow();
    expect(await db.annotations.count()).toBe(1);
    await db.delete();
  });
});

it("rejects stale concurrent edits without overwriting another tab", async () => {
  const db = new MarklyDB(crypto.randomUUID());
  const a = note();
  await db.save(page, a, crypto.randomUUID(), null);
  const newer = { ...a, note: "new version", updatedAt: a.updatedAt + 1 };
  await db.save(page, newer, crypto.randomUUID(), a.updatedAt);
  await expect(
    db.save(
      page,
      { ...a, note: "stale version" },
      crypto.randomUUID(),
      a.updatedAt,
    ),
  ).rejects.toThrow("其他标签页");
  expect((await db.annotations.get(a.id))?.note).toBe("new version");
  await db.delete();
});

it("restores an exported page and annotation into a fresh database", async () => {
  const source = new MarklyDB(crypto.randomUUID()),
    target = new MarklyDB(crypto.randomUUID());
  const a = note();
  await source.save(page, a, crypto.randomUUID());
  const backup = await source.export();
  expect(await target.import(JSON.parse(JSON.stringify(backup)))).toEqual({
    added: 1,
    skipped: 0,
  });
  expect(await target.annotations.get(a.id)).toEqual(a);
  expect((await target.pages.get(page.id))?.url).toBe(page.url);
  await source.delete();
  await target.delete();
});
