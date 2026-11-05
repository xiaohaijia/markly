import { browser } from "wxt/browser";
import { MarklyDB } from "../lib/db";
import { requestSchema, pageKey, type Reply } from "../lib/model";
const db = new MarklyDB();
const scriptId = (origin: string) =>
  "markly-" +
  Array.from(origin)
    .map((c) => c.charCodeAt(0).toString(16))
    .join("");
async function register(origin: string) {
  const id = scriptId(origin);
  const matches = [origin];
  await browser.scripting
    .unregisterContentScripts({ ids: [id] })
    .catch(() => {});
  await browser.scripting.registerContentScripts([
    {
      id,
      matches,
      js: ["content-scripts/markly.js"],
      runAt: "document_idle",
      persistAcrossSessions: true,
    },
  ]);
}
async function notify(pageId?: string) {
  const tabs = await browser.tabs.query({});
  await Promise.allSettled(
    tabs
      .filter((t) => t.id && (!pageId || t.url === pageId))
      .map((t) =>
        browser.tabs.sendMessage(t.id!, { marklyEvent: "changed", pageId }),
      ),
  );
  browser.runtime
    .sendMessage({ marklyEvent: "changed", pageId })
    .catch(() => {});
}
async function inject(tabId: number) {
  const existing = await browser.tabs
    .sendMessage(tabId, { marklyEvent: "probe" })
    .catch(() => null);
  if (existing?.alive) return;
  await browser.scripting.executeScript({
    target: { tabId },
    files: ["/content-scripts/markly.js"],
  });
}
export default defineBackground(() => {
  browser.action.onClicked.addListener(async (tab) => {
    if (!tab.id) return;
    try {
      if (!tab.url || !/^https?:|^file:/.test(tab.url))
        throw new Error("Chrome 内部页面和扩展商店页面不能注入批注");
      await browser.storage.session.set({
        ["enabled-" + tab.id]: new URL(tab.url).origin,
      });
      await browser.tabs
        .sendMessage(tab.id, { marklyEvent: "toggle" })
        .catch(() => inject(tab.id!));
    } catch (error) {
      await browser.tabs.create({
        url:
          browser.runtime.getURL("/notice.html") +
          "?error=" +
          encodeURIComponent(
            error instanceof Error ? error.message : "无法启用，请检查网页权限",
          ),
      });
    }
  });
  browser.tabs.onUpdated.addListener(async (tabId, change, tab) => {
    if (change.status !== "complete" || !tab.url) return;
    const key = "enabled-" + tabId;
    const saved = await browser.storage.session.get(key);
    if (saved[key] === new URL(tab.url).origin)
      await inject(tabId).catch(() => {});
    else if (saved[key]) await browser.storage.session.remove(key);
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    void browser.storage.session.remove("enabled-" + tabId);
  });
  browser.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    if (!raw?.markly) return;
    const run = async (): Promise<Reply> => {
      try {
        if (sender.id !== browser.runtime.id) throw new Error("来源无效");
        const req = requestSchema.parse(raw);
        const extensionPage =
          !!sender.url?.startsWith(browser.runtime.getURL("/")) &&
          !sender.tab?.url?.startsWith("http");
        const content = !sender.url?.startsWith(browser.runtime.getURL("/"));
        let sourceUrl = sender.url;
        if (content) {
          if (!sender.tab?.id || sender.frameId !== 0)
            throw new Error("仅支持主页面");
          if (
            ["all", "export", "import", "enable-site", "disable-site"].includes(
              req.type,
            )
          )
            throw new Error("请在扩展主页执行此操作");
          // sender.url may retain the original document URL after pushState.
          const currentTab = await browser.tabs.get(sender.tab.id);
          const url = currentTab.url;
          if (!url) throw new Error("网页访问权限已失效，请重新启用");
          sourceUrl = url;
          const requested =
            req.type === "list" || req.type === "save"
              ? req.page.id
              : req.type === "delete" || req.type === "clear-page"
                ? req.pageId
                : null;
          if (requested && requested !== pageKey(url))
            throw new Error("页面已变化，请重新尝试");
        } else if (!extensionPage) throw new Error("来源无效");
        let data: unknown = null;
        switch (req.type) {
          case "list":
            if (req.page.id !== req.page.url) throw new Error("页面地址无效");
            data = await db.annotations
              .where("pageId")
              .equals(req.page.id)
              .sortBy("createdAt");
            break;
          case "save":
            if (req.page.id !== req.page.url) throw new Error("页面地址无效");
            await db.save(
              req.page,
              req.annotation,
              req.opId,
              req.expectedUpdatedAt,
            );
            await notify(req.page.id);
            break;
          case "delete":
            await db.remove(
              req.pageId,
              req.id,
              req.opId,
              req.expectedUpdatedAt,
            );
            await notify(req.pageId);
            break;
          case "clear-page":
            await db.clearPage(req.pageId, req.opId);
            await notify(req.pageId);
            break;
          case "all":
            data = await db.export();
            break;
          case "export":
            data = await db.export();
            break;
          case "import":
            data = await db.import(req.backup);
            await notify();
            break;
          case "history":
            await browser.tabs.create({
              url:
                browser.runtime.getURL("/library.html") +
                (sourceUrl ? "?site=" + encodeURIComponent(sourceUrl) : ""),
            });
            break;
          case "enable-site":
            if (!/^(https?:\/\/[^/]+\/\*|file:\/\/\/\*)$/.test(req.origin))
              throw new Error("站点格式无效");
            if (
              !(await browser.permissions.contains({ origins: [req.origin] }))
            )
              throw new Error("未授予站点权限");
            await register(req.origin);
            break;
          case "disable-site":
            await browser.scripting
              .unregisterContentScripts({ ids: [scriptId(req.origin)] })
              .catch(() => {});
            break;
        }
        return { ok: true, data };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "操作失败",
        };
      }
    };
    run().then(sendResponse);
    return true;
  });
  browser.permissions.onRemoved.addListener(async () => {
    const scripts = await browser.scripting.getRegisteredContentScripts();
    for (const s of scripts) {
      if (
        s.matches &&
        !(await browser.permissions.contains({ origins: s.matches }))
      ) {
        await browser.scripting.unregisterContentScripts({ ids: [s.id] });
      }
    }
  });
});
