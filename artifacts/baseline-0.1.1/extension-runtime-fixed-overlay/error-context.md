# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: extension.spec.ts >> runtime: fixed-overlay
- Location: tests/e2e/extension.spec.ts:484:3

# Error details

```
Error: expect(locator).not.toHaveCount(expected) failed

Locator:  getByTestId('text-marks').locator('line')
Expected: not 0
Received: 0
Timeout:  5000ms

Call log:
  - Expect "not toHaveCount" getByTestId('text-marks').locator('line') with timeout 5000ms
  - waiting for getByTestId('text-marks').locator('line')
    14 × locator resolved to 0 elements
       - unexpected value "0"

```

# Test source

```ts
  406 |   await other
  407 |     .getByRole("textbox", { name: "备注内容" })
  408 |     .fill("标签二保留的想法");
  409 |   await other.getByRole("button", { name: "保存备注" }).click();
  410 |   await expect(other.getByRole("region", { name: "编辑备注" })).toContainText(
  411 |     "其他标签页已修改",
  412 |   );
  413 |   await other.getByRole("button", { name: "另存一条" }).click();
  414 |   await expect(page.getByTestId("annotation-card")).toHaveCount(6);
  415 |   await expect(
  416 |     page.getByTestId("annotation-card").filter({ hasText: "标签一的新版本" }),
  417 |   ).toHaveCount(1);
  418 |   await page.close();
  419 |   await other.close();
  420 | });
  421 | 
  422 | test("transformed host, nested scroll, compact notes and text editor regression", async () => {
  423 |   await enableHttp();
  424 |   const page = await context.newPage();
  425 |   await page.goto("http://127.0.0.1:4173/fixtures/compatibility.html");
  426 |   await select(page, "#copy");
  427 |   await page.getByRole("button", { name: "下划线", exact: true }).click();
  428 |   await expect(page.getByTestId("text-marks").locator("line")).not.toHaveCount(
  429 |     0,
  430 |   );
  431 |   const line = page.getByTestId("text-marks").locator("line").first();
  432 |   const before = await line.boundingBox();
  433 |   await page.locator("#scroll").evaluate((el) => (el.scrollTop = 40));
  434 |   await expect
  435 |     .poll(async () => Math.round((await line.boundingBox())!.y))
  436 |     .toBe(Math.round(before!.y - 40));
  437 |   await page.getByRole("button", { name: "矩形", exact: true }).click();
  438 |   const b = await page.locator("#copy").boundingBox();
  439 |   await page.mouse.move(b!.x + 10, b!.y + 5);
  440 |   await page.mouse.down();
  441 |   await page.mouse.move(b!.x + 150, b!.y + 25);
  442 |   await page.mouse.up();
  443 |   await page.keyboard.press("Escape");
  444 |   const shape = page.getByTestId("drawing-layer").locator("g > rect");
  445 |   await expect(shape).toHaveCount(1);
  446 |   const shapeBefore = await shape.boundingBox();
  447 |   await page.locator("#scroll").evaluate((el) => (el.scrollTop = 65));
  448 |   await expect
  449 |     .poll(async () => Math.round((await shape.boundingBox())!.y))
  450 |     .toBe(Math.round(shapeBefore!.y - 25));
  451 |   await page.locator("#count").evaluate((el) => (el.textContent = "2 次喜欢"));
  452 |   await expect(shape).toHaveCount(1);
  453 |   await page.reload();
  454 |   await expect(shape).toHaveCount(1);
  455 |   await select(page, "#copy");
  456 |   await page.getByRole("button", { name: "备注", exact: true }).click();
  457 |   await page
  458 |     .getByRole("textbox", { name: "备注内容" })
  459 |     .fill("图标悬浮预览，默认不展开。");
  460 |   await page.getByRole("button", { name: "保存备注", exact: true }).click();
  461 |   const note = page.getByRole("button", { name: "查看备注", exact: true });
  462 |   await expect(note).toHaveCount(1);
  463 |   await expect(page.getByText("点击图标编辑备注")).toHaveCount(0);
  464 |   await note.hover();
  465 |   await expect(page.getByText("点击图标编辑备注")).toBeVisible();
  466 |   await page.getByRole("button", { name: "文字", exact: true }).click();
  467 |   await page.mouse.click(b!.x + 100, b!.y);
  468 |   const editor = page.getByRole("textbox", { name: "图中文字" });
  469 |   await expect(editor).toBeFocused();
  470 |   await expect(page.getByRole("textbox", { name: "备注内容" })).toHaveCount(0);
  471 |   await editor.fill("第一行文字\n第二行文字");
  472 |   await page.screenshot({ path: "artifacts/text-editor-fixed.png" });
  473 |   await page.getByRole("button", { name: "保存文字", exact: true }).click();
  474 |   await expect(
  475 |     page.getByTestId("drawing-layer").locator("text tspan"),
  476 |   ).toHaveCount(2);
  477 |   await page.getByPlaceholder("网页输入框").fill("仍可正常输入");
  478 |   await page.locator("#page-link").click();
  479 |   await expect(page).toHaveURL(/#end$/);
  480 |   await page.close();
  481 | });
  482 | 
  483 | for (const mode of ["root-transform", "root-zoom", "fixed-overlay", "event-intercept", "host-removal", "body-replaced", "shadow-dom", "element-scale", "modal"]) {
  484 |   test(`runtime: ${mode}`, async () => {
  485 |     await enableHttp();
  486 |     const page = await context.newPage();
  487 |     await page.goto(`http://127.0.0.1:4173/fixtures/runtime.html?mode=${mode}`);
  488 |     const selector = mode === "shadow-dom" ? "#shadow-target" : "#target";
  489 |     const target = page.locator(selector);
  490 |     await expect(page.getByRole("button", {name:"矩形",exact:true})).toBeVisible();
  491 |     if (mode === "modal") {
  492 |       await page.evaluate(() => {
  493 |         const dialog = document.createElement("dialog");
  494 |         document.body.append(dialog);
  495 |         dialog.append(document.querySelector("#scroller")!);
  496 |         dialog.showModal();
  497 |       });
  498 |     }
  499 |     // Dispatch from the real content node, so page event interception is exercised.
  500 |     await target.evaluate(el => {
  501 |       const r = document.createRange(); r.selectNodeContents(el);
  502 |       const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(r);
  503 |       el.dispatchEvent(new MouseEvent("mouseup", {bubbles:true,composed:true}));
  504 |     });
  505 |     await page.getByRole("button", {name:"下划线",exact:true}).click();
> 506 |     await expect(page.getByTestId("text-marks").locator("line")).not.toHaveCount(0);
      |                                                                      ^ Error: expect(locator).not.toHaveCount(expected) failed
  507 |     let original = await target.boundingBox();
  508 |     const firstLine = page.getByTestId("text-marks").locator("line").first();
  509 |     const lineBox = await firstLine.boundingBox();
  510 |     expect(Math.abs(lineBox!.x - original!.x)).toBeLessThan(25);
  511 |     expect(lineBox!.y).toBeGreaterThan(original!.y);
  512 |     expect(lineBox!.y).toBeLessThan(original!.y + original!.height + 2);
  513 |     if (mode === "host-removal") {
  514 |       await page.locator("markly-extension").evaluate(el => el.remove());
  515 |       await expect(page.getByRole("button", {name:"矩形",exact:true})).toBeVisible();
  516 |       await expect(firstLine).toBeVisible();
  517 |       await expect(page.locator("markly-extension")).toHaveCount(1);
  518 |     }
  519 |     if (mode === "body-replaced") {
  520 |       await page.evaluate(() => {
  521 |         const copy = document.body.cloneNode(true);
  522 |         document.body.replaceWith(copy);
  523 |       });
  524 |       await expect(firstLine).toBeVisible();
  525 |     }
  526 |     await page.getByRole("button", {name:"矩形",exact:true}).click();
  527 |     original = await target.boundingBox();
  528 |     await page.mouse.move(original!.x+12,original!.y+12); await page.mouse.down();
  529 |     await page.mouse.move(original!.x+120,original!.y+30); await page.mouse.up();
  530 |     await page.keyboard.press("Escape");
  531 |     await expect(page.getByTestId("annotation-card")).toHaveCount(2);
  532 |     const shape = page.getByTestId("drawing-layer").locator("g > rect");
  533 |     await expect(shape).toHaveCount(1);
  534 |     const before = await shape.boundingBox();
  535 |     expect(Math.abs(before!.x - original!.x - 12)).toBeLessThan(2);
  536 |     expect(Math.abs(before!.y - original!.y - 12)).toBeLessThan(2);
  537 |     if (mode === "element-scale") {
  538 |       await page.locator("#scroller").evaluate(el => (el as HTMLElement).style.transform = "scale(1.1)");
  539 |       await expect.poll(async () => {
  540 |         const b = (await target.boundingBox())!;
  541 |         return Math.round((await shape.boundingBox())!.x - b.x);
  542 |       }).toBe(Math.round(12 * 1.1/.8));
  543 |     }
  544 |     if (!["modal", "shadow-dom"].includes(mode)) {
  545 |       await page.locator("#scroller").evaluate(el => el.scrollTop = 30);
  546 |       await expect.poll(async () => {
  547 |         const b = (await target.boundingBox())!;
  548 |         return Math.round((await shape.boundingBox())!.y - b.y);
  549 |       }).toBe(mode === "element-scale" ? Math.round(12*1.1/.8) : 12);
  550 |     }
  551 |     await page.screenshot({path:`artifacts/runtime-${mode}.png`});
  552 |     await page.close();
  553 |   });
  554 | }
  555 | 
```