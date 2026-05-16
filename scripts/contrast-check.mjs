import { chromium } from "playwright";

function parseRgb(input) {
  const m = input.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return [255, 255, 255];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function luminance([r, g, b]) {
  const srgb = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrast(fg, bg) {
  const l1 = luminance(parseRgb(fg));
  const l2 = luminance(parseRgb(bg));
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}

const url = "http://127.0.0.1:3001";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
await page.goto(url, { waitUntil: "domcontentloaded" });

const openChat = page.getByRole("button", { name: "Open chat" });
if (await openChat.count()) await openChat.click();

const darkBtn = page.getByRole("button", { name: /Dark|Light/ });
if (await darkBtn.count()) await darkBtn.first().click();

await page.waitForTimeout(500);

const report = await page.evaluate(() => {
  const selectors = [
    ".theme-dark .bg-white .text-zinc-700",
    ".theme-dark .bg-zinc-50 .text-zinc-600",
    ".theme-dark .border-zinc-200",
    ".theme-dark .rounded-xl.border.border-zinc-200.bg-white",
  ];

  const rows = [];
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (!el) continue;
    const style = window.getComputedStyle(el);
    const parentStyle = window.getComputedStyle(el.parentElement || document.body);
    rows.push({
      selector,
      color: style.color,
      background: style.backgroundColor,
      parentBackground: parentStyle.backgroundColor,
    });
  }
  return rows;
});

for (const row of report) {
  const bg = row.background === "rgba(0, 0, 0, 0)" ? row.parentBackground : row.background;
  console.log(row.selector, "contrast", contrast(row.color, bg).toFixed(2), row.color, bg);
}

await page.screenshot({ path: "layout-dark-contrast.png", fullPage: true });
await browser.close();
