import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PencilSimple } from "@phosphor-icons/react";
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
});
const page = await browser.newPage({
  viewport: { width: 128, height: 128 },
  deviceScaleFactor: 1,
});
await mkdir("public", { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0"><div style="width:${size}px;height:${size}px;background:#708970;border-radius:${size * 0.22}px;color:white;display:flex;align-items:center;justify-content:center">${renderToStaticMarkup(React.createElement(PencilSimple, { size: size * 0.72, weight: "fill" }))}</div></body>`,
  );
  await page.screenshot({
    path: `public/icon-${size}.png`,
    omitBackground: true,
  });
}
await browser.close();
