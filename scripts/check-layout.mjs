import { chromium, devices } from "playwright";

const URL = process.env.LAYOUT_URL || "http://127.0.0.1:3001";

async function run() {
  const browser = await chromium.launch({ headless: true });

  const scenarios = [
    { name: "desktop-1366", viewport: { width: 1366, height: 768 } },
    { name: "mobile-iphone13", ...devices["iPhone 13"] },
  ];

  for (const scenario of scenarios) {
    const context = await browser.newContext(
      scenario.viewport
        ? { viewport: scenario.viewport }
        : {
            ...scenario,
          },
    );
    const page = await context.newPage();
    let loaded = false;
    let lastError;
    for (let i = 0; i < 20; i += 1) {
      try {
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 5000 });
        loaded = true;
        break;
      } catch (error) {
        lastError = error;
        await page.waitForTimeout(500);
      }
    }
    if (!loaded) throw lastError;
    const openCandidates = ["Open chat", "Chat", "Abrir chat"];
    let opened = false;
    for (const name of openCandidates) {
      const locator = page.getByRole("button", { name });
      if ((await locator.count()) > 0) {
        await locator.first().click();
        opened = true;
        break;
      }
    }
    if (opened) await page.waitForTimeout(700);

    const overflow = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      hasOverflow: document.documentElement.scrollWidth > window.innerWidth,
    }));

    const layoutMetrics = await page.evaluate(() => {
      const title = Array.from(document.querySelectorAll("h2")).find((el) =>
        (el.textContent || "").includes("BrianEnglish1.0"),
      );
      const modal = title?.closest("section") || document.querySelector("section[tabindex='-1']");
      const mic = document.querySelector("button[aria-label='Start recording'], button[aria-label='Send voice message']");
      const controls = document.querySelector("button[aria-label='Toggle sounds']")?.parentElement;

      const modalRect = modal?.getBoundingClientRect();
      const micRect = mic?.getBoundingClientRect();
      const controlsRect = controls?.getBoundingClientRect();

      return {
        micCenterDelta:
          modalRect && micRect
            ? Math.round((micRect.left + micRect.width / 2) - (modalRect.left + modalRect.width / 2))
            : null,
        controlsRightDelta:
          modalRect && controlsRect ? Math.round(controlsRect.right - modalRect.right) : null,
      };
    });

    console.log(`[${scenario.name}]`, { ...overflow, ...layoutMetrics });

    await page.screenshot({ path: `layout-${scenario.name}.png`, fullPage: true });
    await context.close();
  }

  await browser.close();
}

run();
