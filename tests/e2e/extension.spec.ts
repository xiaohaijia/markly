import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
let context: BrowserContext,
  worker: Worker,
  extensionId: string,
  profile: string;
const article = "http://127.0.0.1:4173/fixtures/article.html";
test.beforeAll(async () => {
  profile = await mkdtemp(path.join(tmpdir(), "markly-test-"));
  const extension = path.resolve(
    process.env.MARKLY_BUILD_DIR || ".output/chrome-mv3",
  );
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync(chromium.executablePath())
        ? chromium.executablePath()
        : path.join(
            homedir(),
            "Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium",
          )),
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
    viewport: { width: 1440, height: 1000 },
  });
  worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  extensionId = new URL(worker.url()).host;
  // Seed only the test profile's site permission; native permission bubbles are outside page automation.
  const permissions = await context.newPage();
  await permissions.goto("chrome://extensions");
  await permissions.evaluate(async (id) => {
    const api = (
      globalThis as unknown as {
        chrome: {
          developerPrivate: {
            addHostPermission: (id: string, host: string) => Promise<void>;
          };
        };
      }
    ).chrome.developerPrivate;
    await api.addHostPermission(id, "http://127.0.0.1/*");
  }, extensionId);
  await permissions.close();
});
test.afterEach(async ({}, info) => {
  if (info.status === info.expectedStatus) return;
  const pages = context.pages();
  for (let i = 0; i < pages.length; i++) {
    await pages[i]!.screenshot({ path: `artifacts/debug-${i}.png` });
  }
});
test.afterAll(async () => {
  await context?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
});
async function select(page: Page, selector: string, text?: string) {
  await page.locator(selector).evaluate((el, needle) => {
    (document.activeElement as HTMLElement | null)?.blur();
    const range = document.createRange();
    if (needle) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const start = n.textContent!.indexOf(needle);
        if (start >= 0) {
          range.setStart(n, start);
          range.setEnd(n, start + needle.length);
          break;
        }
      }
    } else range.selectNodeContents(el);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  }, text);
}
test("extension workflows and screenshots", async () => {
  const history = await context.newPage();
  await history.goto(
    `chrome-extension://${extensionId}/library.html?site=${encodeURIComponent(article)}`,
  );
  await history.getByRole("button", { name: "允许并启用" }).click();
  await expect(
    history.getByRole("button", { name: "关闭自动启用" }),
  ).toBeVisible();
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("PAGE ERROR", e.message);
  });
  await page.goto(article);
  await page
    .getByRole("button", { name: "显示 / 收起批注面板", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "我的标记" }),
  ).toBeVisible();
  await select(page, "#intro strong");
  await page.getByRole("button", { name: "高亮", exact: true }).click();
  await expect(page.getByTestId("annotation-card")).toHaveCount(1);
  await select(page, "#shift");
  await page.getByRole("button", { name: "备注", exact: true }).click();
  await page
    .getByRole("textbox", { name: "备注内容" })
    .fill("从回答问题，走向完成任务。");
  await page.getByRole("button", { name: "保存备注" }).click();
  await expect(page.getByTestId("annotation-card")).toHaveCount(2);
  await page.reload();
  await page
    .getByRole("button", { name: "显示 / 收起批注面板", exact: true })
    .click();
  await expect(page.getByTestId("annotation-card")).toHaveCount(2);
  await expect(page.getByText("原文待定位", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "页面备注", exact: true }).click();
  await page.mouse.click(400, 300);
  await page
    .getByRole("textbox", { name: "备注内容" })
    .fill("这篇文章可以作为下一期视频素材。");
  await page.getByRole("button", { name: "保存备注" }).click();
  await expect(page.getByTestId("annotation-card")).toHaveCount(3);
  await page.getByRole("button", { name: "矩形", exact: true }).click();
  const box = await page.locator("#quote").boundingBox();
  if (!box) throw new Error("quote missing");
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 5, box.y + box.height - 5, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(page.getByTestId("annotation-card")).toHaveCount(4);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(page.getByTestId("annotation-card")).toHaveCount(3);
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect(page.getByTestId("annotation-card")).toHaveCount(4);
  await page.getByRole("button", { name: "隐藏标记", exact: true }).click();
  await expect(page.getByTestId("drawing-layer")).toHaveCount(0);
  await page.getByRole("button", { name: "显示标记", exact: true }).click();
  await page.getByPlaceholder("这里不应弹出划词工具条").fill("网页输入正常");
  await page
    .getByRole("complementary", { name: "我的标记" })
    .screenshot({ path: "artifacts/page-index.png" });
  await page.screenshot({ path: "artifacts/extension-desktop.png" });
  await history.reload();
  await history.getByRole("textbox", { name: "搜索全部标记" }).fill("完成任务");
  await expect(
    history.getByText("从回答问题，走向完成任务。", { exact: true }),
  ).toBeVisible();
  await history.screenshot({ path: "artifacts/history-desktop.png" });
  await page.setViewportSize({ width: 600, height: 850 });
  await page.screenshot({ path: "artifacts/extension-narrow.png" });
  const panel = await page
    .getByRole("complementary", { name: "我的标记" })
    .boundingBox();
  expect(panel!.x).toBeGreaterThanOrEqual(0);
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(600);
  expect(errors).toEqual([]);
});

async function enableHttp() {
  const settings = await context.newPage();
  await settings.goto(
    `chrome-extension://${extensionId}/library.html?site=${encodeURIComponent(article)}`,
  );
  const button = settings.getByRole("button", { name: "允许并启用" });
  if (await button.isVisible()) await button.click();
  await expect(
    settings.getByRole("button", { name: "关闭自动启用" }),
  ).toBeVisible();
  await settings.close();
}
async function addNote(page: Page, text: string) {
  await page.getByRole("button", { name: "页面备注", exact: true }).click();
  await page.mouse.click(400, 300);
  await page.getByRole("textbox", { name: "备注内容" }).fill(text);
  await page.getByRole("button", { name: "保存备注" }).click();
  await expect(page.getByRole("region", { name: "编辑备注" })).toHaveCount(0);
}

test("multiple tabs, worker restart, SPA separation and reattachment", async () => {
  await enableHttp();
  const url = article + "?case=durability";
  const first = await context.newPage(),
    second = await context.newPage();
  await first.goto(url);
  await first
    .getByRole("button", { name: "显示 / 收起批注面板", exact: true })
    .click();
  await second.goto(url);
  await second
    .getByRole("button", { name: "显示 / 收起批注面板", exact: true })
    .click();
  await addNote(first, "跨标签页保存");
  await expect(second.getByTestId("annotation-card")).toHaveCount(1);
  const cdp = await context.newCDPSession(first);
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.stopAllWorkers");
  await addNote(second, "后台重启后保存");
  await expect(first.getByTestId("annotation-card")).toHaveCount(2);
  await cdp.detach();
  await first.evaluate(() =>
    history.pushState({}, "", location.href + "#different"),
  );
  await expect(first.getByTestId("annotation-card")).toHaveCount(0);
  await addNote(first, "独立路由备注");
  await expect(first.getByTestId("annotation-card")).toHaveCount(1);
  await first.evaluate(() => history.back());
  await expect(first.getByTestId("annotation-card")).toHaveCount(2);
  await select(first, "#chinese");
  await first.getByRole("button", { name: "下划线", exact: true }).click();
  await expect(first.getByTestId("annotation-card")).toHaveCount(3);
  await first.locator("#chinese").evaluate((el) => el.remove());
  await expect(first.getByText("原文待定位", { exact: true })).toBeVisible();
  const orphan = first
    .getByTestId("annotation-card")
    .filter({ hasText: "原文待定位" });
  await orphan.getByRole("button", { name: "标记操作" }).click();
  await orphan.getByRole("button", { name: "重新关联" }).click();
  await select(first, "#intro strong");
  await first.getByRole("button", { name: "关联到此处" }).click();
  await expect(first.getByText("原文待定位", { exact: true })).toHaveCount(0);
  await expect(second.getByTestId("annotation-card")).toHaveCount(3);
  await first.close();
  const reopened = await context.newPage();
  await reopened.goto(url);
  await reopened
    .getByRole("button", { name: "显示 / 收起批注面板", exact: true })
    .click();
  await expect(reopened.getByTestId("annotation-card")).toHaveCount(3);
  await expect(
    reopened
      .getByTestId("annotation-card")
      .filter({ hasText: "perceive its environment" }),
  ).toBeVisible();
  await reopened
    .getByTestId("annotation-card")
    .filter({ hasText: "perceive its environment" })
    .click();
  await expect(reopened.locator("#intro")).toBeInViewport();
  await second.close();
  await reopened.close();
});

test("backup export import and invalid file rollback through UI", async () => {
  const history = await context.newPage();
  await history.goto(`chrome-extension://${extensionId}/library.html`);
  const downloadPromise = history.waitForEvent("download");
  await history.getByRole("button", { name: "导出备份" }).click();
  const download = await downloadPromise;
  const file = await download.path();
  expect(file).toBeTruthy();
  await history.locator("#import").setInputFiles(file!);
  await expect(history.getByRole("status")).toContainText("新增 0 条");
  await history.locator("#import").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":"markly","version":99}'),
  });
  await expect(history.getByRole("status")).toContainText(
    "导入失败，未写入数据",
  );
  await history.close();
});

test("local HTML permission, drawing restore and nested scrolling", async () => {
  const permissions = await context.newPage();
  await permissions.goto("chrome://extensions");
  await permissions.evaluate(async (id) => {
    const api = (
      globalThis as unknown as {
        chrome: {
          developerPrivate: {
            updateExtensionConfiguration: (config: {
              extensionId: string;
              fileAccess: boolean;
            }) => Promise<void>;
          };
        };
      }
    ).chrome.developerPrivate;
    await api.updateExtensionConfiguration({
      extensionId: id,
      fileAccess: true,
    });
  }, extensionId);
  await permissions.close();
  const url = new URL("file://" + path.resolve("fixtures/article.html")).href;
  const settings = await context.newPage();
  await settings.goto(
    `chrome-extension://${extensionId}/library.html?site=${encodeURIComponent(url)}`,
  );
  await settings.getByRole("button", { name: "允许并启用" }).click();
  await expect(
    settings.getByRole("button", { name: "关闭自动启用" }),
  ).toBeVisible();
  const page = await context.newPage();
  await page.goto(url);
  await page
    .getByRole("button", { name: "显示 / 收起批注面板", exact: true })
    .click();
  await select(page, "#intro strong");
  await page.getByRole("button", { name: "高亮", exact: true }).click();
  await expect(page.getByTestId("annotation-card")).toHaveCount(1);
  await page.reload();
  await page
    .getByRole("button", { name: "显示 / 收起批注面板", exact: true })
    .click();
  await expect(page.getByTestId("annotation-card")).toHaveCount(1);
  await page.getByRole("button", { name: "椭圆", exact: true }).click();
  const box = await page.locator("#quote").boundingBox();
  await page.mouse.move(box!.x + 12, box!.y + 12);
  await page.mouse.down();
  await page.mouse.move(box!.x + 120, box!.y + 50, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("annotation-card")).toHaveCount(2);
  await page.reload();
  await page
    .getByRole("button", { name: "显示 / 收起批注面板", exact: true })
    .click();
  await expect(
    page.getByTestId("drawing-layer").locator(":scope > g > ellipse"),
  ).toHaveCount(1);
  const original = await page
    .getByTestId("drawing-layer")
    .locator(":scope > g > ellipse")
    .boundingBox();
  await page.evaluate(() => window.scrollBy(0, 100));
  await expect
    .poll(async () =>
      Math.round(
        (await page
          .getByTestId("drawing-layer")
          .locator(":scope > g > ellipse")
          .boundingBox())!.y,
      ),
    )
    .toBe(Math.round(original!.y - 100));
  await page.locator("section.scroll").scrollIntoViewIfNeeded();
  await page.locator("section.scroll").evaluate((el) => (el.scrollTop = 160));
  await select(page, "#nested");
  await page.getByRole("button", { name: "删除线", exact: true }).click();
  await expect(page.getByTestId("annotation-card")).toHaveCount(3);
  await page.reload();
  await page
    .getByRole("button", { name: "显示 / 收起批注面板", exact: true })
    .click();
  await expect(page.getByTestId("annotation-card")).toHaveCount(3);
  await expect(page.getByText("原文待定位", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: "artifacts/local-html.png" });
  await page.close();
  await settings.close();
});

test("pen arrow text and shape editing plus conflicting note edits", async () => {
  await enableHttp();
  const url = article + "?case=editing",
    page = await context.newPage();
  await page.goto(url);
  await page
    .getByRole("button", { name: "显示 / 收起批注面板", exact: true })
    .click();
  const box = await page.locator("#quote").boundingBox();
  const x = box!.x + 20,
    y = box!.y + 15;
  for (const [name, offset] of [
    ["自由画笔", 0],
    ["箭头", 50],
    ["矩形", 100],
  ] as const) {
    await page.getByRole("button", { name, exact: true }).click();
    await page.mouse.move(x + offset, y);
    await page.mouse.down();
    await page.mouse.move(x + offset + 70, y + 30, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.press("Escape");
  }
  await expect(page.getByTestId("annotation-card")).toHaveCount(3);
  await page.getByRole("button", { name: "文字", exact: true }).click();
  await page.mouse.click(x + 200, y);
  await page.getByRole("textbox", { name: "图中文字" }).fill("核心能力！");
  await page.getByRole("button", { name: "保存文字" }).click();
  await expect(page.getByTestId("annotation-card")).toHaveCount(4);
  const rect = page
    .getByTestId("annotation-card")
    .filter({ hasText: "矩形标注" });
  await rect.click();
  const outline = page
    .getByTestId("drawing-layer")
    .locator("rect[stroke-dasharray]");
  await expect(outline).toHaveCount(1);
  const before = await outline.boundingBox();
  await page.mouse.move(before!.x + 10, before!.y + 10);
  await page.mouse.down();
  await page.mouse.move(before!.x + 30, before!.y + 25, { steps: 4 });
  await page.mouse.up();
  await expect
    .poll(async () => Math.round((await outline.boundingBox())!.x))
    .toBe(Math.round(before!.x + 20));
  const handle = page.getByTestId("drawing-layer").locator('rect[width="10"]');
  const hb = await handle.boundingBox();
  const oldWidth = (await outline.boundingBox())!.width;
  await page.mouse.move(hb!.x + 5, hb!.y + 5);
  await page.mouse.down();
  await page.mouse.move(hb!.x + 35, hb!.y + 25, { steps: 4 });
  await page.mouse.up();
  await expect
    .poll(async () => (await outline.boundingBox())!.width)
    .toBeGreaterThan(oldWidth + 20);
  await page.keyboard.press("Escape");
  await addNote(page, "初始备注");
  const other = await context.newPage();
  await other.goto(url);
  await other
    .getByRole("button", { name: "显示 / 收起批注面板", exact: true })
    .click();
  await expect(other.getByTestId("annotation-card")).toHaveCount(5);
  for (const p of [page, other]) {
    const card = p
      .getByTestId("annotation-card")
      .filter({ hasText: "初始备注" });
    await card.getByRole("button", { name: "标记操作" }).click();
    await card.getByRole("button", { name: "编辑备注" }).click();
  }
  await page.getByRole("textbox", { name: "备注内容" }).fill("标签一的新版本");
  await page.getByRole("button", { name: "保存备注" }).click();
  await expect(
    other.getByTestId("annotation-card").filter({ hasText: "标签一的新版本" }),
  ).toHaveCount(1);
  await other
    .getByRole("textbox", { name: "备注内容" })
    .fill("标签二保留的想法");
  await other.getByRole("button", { name: "保存备注" }).click();
  await expect(other.getByRole("region", { name: "编辑备注" })).toContainText(
    "其他标签页已修改",
  );
  await other.getByRole("button", { name: "另存一条" }).click();
  await expect(page.getByTestId("annotation-card")).toHaveCount(6);
  await expect(
    page.getByTestId("annotation-card").filter({ hasText: "标签一的新版本" }),
  ).toHaveCount(1);
  await page.close();
  await other.close();
});

test("transformed host, nested scroll, compact notes and text editor regression", async () => {
  await enableHttp();
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4173/fixtures/compatibility.html");
  await page
    .getByRole("button", { name: "显示 / 收起批注面板", exact: true })
    .click();
  await select(page, "#copy");
  await page.getByRole("button", { name: "下划线", exact: true }).click();
  await expect(page.getByTestId("text-marks").locator("line")).not.toHaveCount(
    0,
  );
  const line = page.getByTestId("text-marks").locator("line").first();
  const before = await line.boundingBox();
  await page.locator("#scroll").evaluate((el) => (el.scrollTop = 40));
  await expect
    .poll(async () => Math.round((await line.boundingBox())!.y))
    .toBe(Math.round(before!.y - 40));
  await page.getByRole("button", { name: "矩形", exact: true }).click();
  const b = await page.locator("#copy").boundingBox();
  await page.mouse.move(b!.x + 10, b!.y + 5);
  await page.mouse.down();
  await page.mouse.move(b!.x + 150, b!.y + 25);
  await page.mouse.up();
  await page.keyboard.press("Escape");
  const shape = page.getByTestId("drawing-layer").locator(":scope > g > rect");
  await expect(shape).toHaveCount(1);
  const shapeBefore = await shape.boundingBox();
  await page.locator("#scroll").evaluate((el) => (el.scrollTop = 65));
  await expect
    .poll(async () => Math.round((await shape.boundingBox())!.y))
    .toBe(Math.round(shapeBefore!.y - 25));
  await page.locator("#count").evaluate((el) => (el.textContent = "2 次喜欢"));
  await expect(shape).toHaveCount(1);
  await page.reload();
  await page
    .getByRole("button", { name: "显示 / 收起批注面板", exact: true })
    .click();
  await expect(shape).toHaveCount(1);
  await select(page, "#copy");
  await page.getByRole("button", { name: "备注", exact: true }).click();
  await page
    .getByRole("textbox", { name: "备注内容" })
    .fill("图标悬浮预览，默认不展开。");
  await page.getByRole("button", { name: "保存备注", exact: true }).click();
  const note = page.getByRole("button", { name: "查看备注", exact: true });
  await expect(note).toHaveCount(1);
  await expect(
    page.getByRole("tooltip").filter({ hasText: "图标悬浮预览，默认不展开。" }),
  ).toHaveCount(0);
  await note.hover();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "图标悬浮预览，默认不展开。" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "文字", exact: true }).click();
  await page.mouse.click(b!.x + 100, b!.y);
  const editor = page.getByRole("textbox", { name: "图中文字" });
  await expect(editor).toBeFocused();
  await expect(page.getByRole("textbox", { name: "备注内容" })).toHaveCount(0);
  await editor.fill("第一行文字\n第二行文字");
  await page.screenshot({ path: "artifacts/text-editor-fixed.png" });
  await page.getByRole("button", { name: "保存文字", exact: true }).click();
  await expect(
    page.getByTestId("drawing-layer").locator("text tspan"),
  ).toHaveCount(2);
  await page.getByPlaceholder("网页输入框").fill("仍可正常输入");
  await page.locator("#page-link").click();
  await expect(page).toHaveURL(/#end$/);
  await page.close();
});

for (const mode of [
  "root-transform",
  "root-zoom",
  "fixed-overlay",
  "event-intercept",
  "host-removal",
  "body-replaced",
  "shadow-dom",
  "element-scale",
  "modal",
]) {
  test(`runtime: ${mode}`, async () => {
    await enableHttp();
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:4173/fixtures/runtime.html?mode=${mode}`);
    await page
      .getByRole("button", { name: "显示 / 收起批注面板", exact: true })
      .click();
    const selector = mode === "shadow-dom" ? "#shadow-target" : "#target";
    const target = page.locator(selector);
    await expect(
      page.getByRole("button", { name: "矩形", exact: true }),
    ).toBeVisible();
    if (mode === "modal") {
      await page.evaluate(() => {
        const dialog = document.createElement("dialog");
        document.body.append(dialog);
        dialog.append(document.querySelector("#scroller")!);
        dialog.showModal();
      });
    }
    // Dispatch from the real content node, so page event interception is exercised.
    await target.evaluate((el) => {
      (document.activeElement as HTMLElement | null)?.blur();
      const r = document.createRange();
      r.selectNodeContents(el);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(r);
      el.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, composed: true }),
      );
    });
    await page.getByRole("button", { name: "下划线", exact: true }).click();
    await expect(
      page.getByTestId("text-marks").locator("line"),
    ).not.toHaveCount(0);
    let original = await target.boundingBox();
    const firstLine = page.getByTestId("text-marks").locator("line").first();
    const lineBox = await firstLine.boundingBox();
    expect(Math.abs(lineBox!.x - original!.x)).toBeLessThan(25);
    expect(lineBox!.y).toBeGreaterThan(original!.y);
    expect(lineBox!.y).toBeLessThan(original!.y + original!.height + 2);
    if (mode === "host-removal") {
      await page.locator("markly-extension").evaluate((el) => el.remove());
      await expect(
        page.getByRole("button", { name: "矩形", exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("text-marks")).toBeVisible();
      await expect(firstLine).toHaveCount(1);
      await expect(page.locator("markly-extension")).toHaveCount(1);
    }
    if (mode === "body-replaced") {
      await page.evaluate(() => {
        const copy = document.body.cloneNode(true);
        document.body.replaceWith(copy);
      });
      await expect(page.getByTestId("text-marks")).toBeVisible();
      await expect(firstLine).toHaveCount(1);
    }
    await page.getByRole("button", { name: "矩形", exact: true }).click();
    original = await target.boundingBox();
    await page.mouse.move(original!.x + 12, original!.y + 12);
    await page.mouse.down();
    await page.mouse.move(original!.x + 120, original!.y + 30);
    await page.mouse.up();
    await page.keyboard.press("Escape");
    if (mode === "modal") await expect(page.locator("dialog")).toBeVisible();
    await expect(page.getByTestId("annotation-card")).toHaveCount(2);
    const shape = page
      .getByTestId("drawing-layer")
      .locator(":scope > g > rect");
    await expect(shape).toHaveCount(1);
    const before = await shape.boundingBox();
    expect(Math.abs(before!.x - original!.x - 12)).toBeLessThan(2);
    expect(Math.abs(before!.y - original!.y - 12)).toBeLessThan(2);
    if (mode === "element-scale") {
      await page
        .locator("#scroller")
        .evaluate((el) => ((el as HTMLElement).style.transform = "scale(1.1)"));
      await expect
        .poll(async () => {
          const b = (await target.boundingBox())!;
          return Math.abs(
            (await shape.boundingBox())!.x -
              b.x -
              (((before!.x - original!.x + 1) * 1.1) / 0.8 - 1),
          );
        })
        .toBeLessThan(1.5);
    }
    if (!["modal", "shadow-dom"].includes(mode)) {
      await page.locator("#scroller").evaluate((el) => (el.scrollTop = 30));
      await expect
        .poll(async () => {
          const b = (await target.boundingBox())!;
          const expected =
            mode === "element-scale"
              ? ((before!.y - original!.y + 1) * 1.1) / 0.8 - 1
              : before!.y - original!.y;
          return Math.abs((await shape.boundingBox())!.y - b.y - expected);
        })
        .toBeLessThan(1.5);
    }
    await page.screenshot({ path: `artifacts/runtime-${mode}.png` });
    await page.reload();
    await page
      .getByRole("button", { name: "显示 / 收起批注面板", exact: true })
      .click();
    await expect(page.getByTestId("annotation-card")).toHaveCount(2);
    await expect(shape).toHaveCount(1);
    await expect
      .poll(async () => {
        const b = (await target.boundingBox())!;
        return Math.abs(
          (await shape.boundingBox())!.x - b.x - (before!.x - original!.x),
        );
      })
      .toBeLessThan(1.5);
    await page.close();
  });
}

test("compact workflow: direct drawing edits and current-page clear", async () => {
  await enableHttp();
  const page = await context.newPage();
  await page.goto(article + "?compact");
  const panel = page.getByRole("complementary", { name: "我的标记" });
  await expect(
    page.getByRole("button", { name: "矩形", exact: true }),
  ).toBeVisible();
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "矩形", exact: true }).click();
  const b = (await page.locator("#quote").boundingBox())!;
  await page.mouse.move(b.x + 10, b.y + 10);
  await page.mouse.down();
  await page.mouse.move(b.x + 150, b.y + 50, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
  const shape = page
    .getByTestId("drawing-layer")
    .locator(":scope > g > rect[rx]");
  await expect(shape).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "清空当前页批注", exact: true }),
  ).toBeEnabled();
  const before = (await shape.boundingBox())!;
  await page.mouse.move(before.x + 30, before.y + 1);
  await page.mouse.down();
  await page.mouse.move(before.x + 70, before.y + 21, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => (await shape.boundingBox())!.x)
    .toBeCloseTo(before.x + 40, 0);
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByRole("textbox", { name: "备注内容" }).fill("直接编辑");
  await page.getByRole("button", { name: "保存备注" }).click();
  await expect(page.getByRole("textbox", { name: "备注内容" })).toHaveCount(0);
  await expect(panel).toHaveCount(0);
  await page
    .getByRole("button", { name: "清空当前页批注", exact: true })
    .click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(shape).toHaveCount(1);
  await page
    .getByRole("button", { name: "清空当前页批注", exact: true })
    .click();
  await page.getByRole("button", { name: "确认清空", exact: true }).click();
  await expect(shape).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "矩形", exact: true }),
  ).toBeVisible();
  await expect(panel).toHaveCount(0);
  await expect(shape).toHaveCount(0);
  await page.close();
});

test("placed note stays at clicked content through scroll and reload", async () => {
  await enableHttp();
  const page = await context.newPage();
  await page.goto(article + "?placed-note");
  await page.getByRole("button", { name: "收起工具栏" }).click();
  await expect(page.getByRole("navigation", { name: "批注工具" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("complementary", { name: "我的标记" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "展开工具栏" }).click();
  for (const name of ["矩形", "椭圆"]) {
    const tool = page.getByRole("button", { name, exact: true });
    await tool.hover();
    const tip = page.getByRole("tooltip").filter({ hasText: name });
    await expect(tip).toBeVisible();
    const r = (await tool.boundingBox())!,
      t = (await tip.boundingBox())!;
    expect(Math.abs(r.x - t.x - t.width - 8)).toBeLessThan(1);
    expect(Math.abs(r.y + r.height / 2 - t.y - t.height / 2)).toBeLessThan(1);
  }
  await page.getByRole("button", { name: "页面备注", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "备注内容" })).toHaveCount(0);
  const target = (await page.locator("#quote").boundingBox())!;
  const x = target.x + 100,
    y = target.y + 20;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 20, y);
  await page.mouse.up();
  await expect(page.getByRole("textbox", { name: "备注内容" })).toHaveCount(0);
  await page.mouse.click(x, y);
  const sample = "你好\n你好\n\n你好";
  const card = page.getByRole("region", { name: "编辑备注" });
  const editorBox = (await card.boundingBox())!;
  expect(Math.abs(editorBox.x - x)).toBeLessThan(30);
  await page.getByRole("textbox", { name: "备注内容" }).fill(sample);
  await card.screenshot({ path: "artifacts/note-composer.png" });
  await page.getByRole("button", { name: "保存备注" }).click();
  const marker = page.getByRole("button", { name: "查看备注", exact: true });
  await expect(marker).toHaveCount(1);
  const initial = (await marker.boundingBox())!;
  expect(Math.abs(initial.x + initial.width / 2 - x)).toBeLessThan(3);
  expect(Math.abs(initial.y + initial.height / 2 - y)).toBeLessThan(3);
  await expect(
    page.getByRole("complementary", { name: "我的标记" }),
  ).toHaveCount(0);
  await page.evaluate(() => scrollBy(0, 100));
  await expect
    .poll(async () => (await marker.boundingBox())!.y)
    .toBeCloseTo(initial.y - 100, 0);
  await page.reload();
  await expect(marker).toHaveCount(1);
  const restored = (await page.locator("#quote").boundingBox())!;
  const after = (await marker.boundingBox())!;
  expect(Math.abs(after.y + after.height / 2 - (restored.y + 20))).toBeLessThan(
    3,
  );
  await marker.hover();
  const preview = page.getByRole("tooltip").filter({ hasText: "你好" });
  await preview.hover();
  const previewBox = (await preview.boundingBox())!;
  expect(previewBox.x - after.x - after.width).toBeGreaterThanOrEqual(6);
  expect(
    Math.abs(previewBox.y + previewBox.height / 2 - after.y - after.height / 2),
  ).toBeLessThan(3);
  await preview.screenshot({ path: "artifacts/note-reader.png" });
  await expect(preview).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await marker.click();
  await expect(page.getByRole("textbox", { name: "备注内容" })).toHaveValue(
    sample,
  );
  await page
    .getByRole("textbox", { name: "备注内容" })
    .fill("修改之后还在这里");
  await page.getByRole("button", { name: "保存备注" }).click();
  await expect(marker).toHaveCount(1);
  await page.getByRole("button", { name: "页面备注", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox", { name: "备注内容" })).toHaveCount(0);
  await expect(marker).toHaveCount(1);
  await page.screenshot({ path: "artifacts/placed-note.png" });
  await page.close();
});

test("editing another note preserves the active draft", async () => {
  await enableHttp();
  const page = await context.newPage();
  await page.goto(article + "?draft-guard");
  await page
    .getByRole("button", { name: "显示 / 收起批注面板", exact: true })
    .click();
  await addNote(page, "第一条");
  await addNote(page, "第二条");
  const first = page
    .getByTestId("annotation-card")
    .filter({ hasText: "第一条" });
  const second = page
    .getByTestId("annotation-card")
    .filter({ hasText: "第二条" });
  await first.click();
  const textbox = page.getByRole("textbox", { name: "备注内容" });
  await textbox.fill("尚未保存的想法");
  await second.click();
  await expect(textbox).toHaveValue("尚未保存的想法");
  await page.getByRole("button", { name: "继续编辑", exact: true }).click();
  await page.getByRole("button", { name: "保存备注", exact: true }).click();
  await expect(textbox).toHaveCount(0);
  await expect(
    page.getByTestId("annotation-card").filter({ hasText: "尚未保存的想法" }),
  ).toHaveCount(1);
  await expect(second).toHaveCount(1);
  await page.close();
});

test("failed note save can retry without losing newer draft text", async () => {
  await enableHttp();
  const page = await context.newPage();
  await page.goto(article + "?retry-draft");
  await page.getByRole("button", { name: "页面备注", exact: true }).click();
  await page.mouse.click(400, 300);
  const field = page.getByRole("textbox", { name: "备注内容" });
  await field.fill("第一次内容");
  // Fail one IndexedDB write only in this disposable extension test profile.
  await worker.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      ...args: Parameters<typeof original>
    ) {
      if (this.name === "annotations") {
        IDBObjectStore.prototype.put = original;
        throw new DOMException("test write failure", "QuotaExceededError");
      }
      return original.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "保存备注", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "重试保存", exact: true }),
  ).toBeVisible();
  await field.fill("失败后继续补充的内容");
  await page.getByRole("button", { name: "重试保存", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "保存备注", exact: true }),
  ).toBeEnabled();
  await expect(field).toHaveValue("失败后继续补充的内容");
  await page.getByRole("button", { name: "保存备注", exact: true }).click();
  await expect(field).toHaveCount(0);
  await page
    .getByRole("button", { name: "显示 / 收起批注面板", exact: true })
    .click();
  await expect(page.getByTestId("annotation-card")).toHaveCount(1);
  await expect(page.getByTestId("annotation-card")).toContainText(
    "失败后继续补充的内容",
  );
  await page.close();
});

test("browser action switches off the entire extension surface", async () => {
  await enableHttp();
  const page = await context.newPage();
  const url = article + "?action-toggle";
  await page.goto(url);
  const tools = page.getByRole("navigation", { name: "批注工具" });
  const panel = page.getByRole("complementary", { name: "我的标记" });
  await expect(tools).toBeVisible();
  const toggle = () =>
    worker.evaluate(async (url) => {
      const api = (
        globalThis as unknown as {
          chrome: {
            tabs: {
              query: (q: object) => Promise<{ id?: number; url?: string }[]>;
              sendMessage: (id: number, m: object) => Promise<unknown>;
            };
          };
        }
      ).chrome;
      const tab = (await api.tabs.query({})).find((t) => t.url === url);
      if (!tab?.id) throw new Error("test tab not found");
      await api.tabs.sendMessage(tab.id, { marklyEvent: "toggle" });
    }, url);
  await page
    .getByRole("button", { name: "显示 / 收起批注面板", exact: true })
    .click();
  await expect(panel).toBeVisible();
  await page.getByRole("button", { name: "矩形", exact: true }).click();
  await toggle();
  await expect(page.getByTestId("markly-app")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "展开工具栏", exact: true }),
  ).toHaveCount(0);
  await expect(tools).toHaveCount(0);
  await expect(panel).toHaveCount(0);
  await page.getByPlaceholder("这里不应弹出划词工具条").fill("仍能输入");
  await toggle();
  await expect(tools).toBeVisible();
  await expect(panel).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "浏览 / 选择", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "收起工具栏", exact: true }).click();
  await expect(tools).toHaveCount(0);
  await toggle();
  await expect(page.getByTestId("markly-app")).toHaveCount(0);
  await toggle();
  await expect(tools).toBeVisible();
  await expect(panel).toHaveCount(0);
  await page.close();
});
