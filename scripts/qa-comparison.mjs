import {chromium} from '@playwright/test';
import {homedir} from 'node:os';
import path from 'node:path';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||path.join(homedir(),'Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium')});const page=await browser.newPage({viewport:{width:1520,height:1800},deviceScaleFactor:1});await page.goto(new URL('file://'+path.resolve('artifacts/design-comparison.html')).href);await page.screenshot({path:'artifacts/design-comparison.png',fullPage:true});await browser.close();
