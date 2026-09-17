import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

// Public-page baseline only. Authenticated learning and real devices require staging evidence.
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4179", "--strictPort"], { windowsHide: true, stdio: "pipe" });
let diagnostics = "";
server.stderr.on("data", chunk => { diagnostics += chunk; });
let browser;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Preview failed: ${diagnostics}`);
    try { if ((await fetch("http://127.0.0.1:4179")).ok) break; } catch { /* wait for this preview process */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  const samples = [];
  for (const route of ["/", "/login", "/signup"]) for (let sample = 0; sample < 3; sample++) {
    const context = await browser.newContext({viewport:{width:1280,height:720}});
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:4179${route}`, {waitUntil:"networkidle"});
    const result = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      const resources = performance.getEntriesByType("resource");
      return { domContentLoadedMs: navigation.domContentLoadedEventEnd, loadMs:navigation.loadEventEnd,
        firstContentfulPaintMs: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
        transferredBytes:resources.reduce((total,item)=>total+item.transferSize,0), resourceCount:resources.length };
    });
    samples.push({route,sample,...result});
    await context.close();
  }
  const result = {measuredAt:new Date().toISOString(),environment:"Local Windows Chromium; production preview; fresh browser contexts; unthrottled loopback; public pages only",samples};
  await mkdir(".local-backups",{recursive:true});
  await writeFile(".local-backups/browser-performance.json",JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} finally {
  if (browser) await browser.close();
  server.kill();
}
