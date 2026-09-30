import { expect } from "@playwright/test";

export async function loginIfConfigured(page) {
  const username = process.env.ONEPOS_E2E_USERNAME || "";
  const password = process.env.ONEPOS_E2E_PASSWORD || "";
  if (!username || !password) return false;

  await page.goto("./");
  const usernameField = page.getByPlaceholder("Email or username");
  if (await usernameField.isVisible().catch(() => false)) {
    await usernameField.fill(username);
    await page.getByPlaceholder("Password").fill(password);

    const loginResponsePromise = page.waitForResponse(
      (response) => response.url().includes("/api/auth/login") && response.request().method() === "POST",
      { timeout: 30_000 },
    );

    await page.getByRole("button", { name: /^Sign In$/ }).click();
    const loginResponse = await loginResponsePromise;
    let loginBody = null;
    try { loginBody = await loginResponse.json(); } catch {}

    if (!loginResponse.ok() || loginBody?.success === false) {
      throw new Error(`Login failed (${loginResponse.status()}): ${loginBody?.message || "authentication rejected"}`);
    }

    await expect.poll(
      () => page.evaluate(() => Boolean(sessionStorage.getItem("onepos_token"))),
      { timeout: 15_000, message: "Login returned success but onepos_token was not stored" },
    ).toBe(true);

    await expect(usernameField).toBeHidden({ timeout: 15_000 });
  }
  return true;
}

export function watchRuntimeFailures(page) {
  const failures = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !/favicon|ResizeObserver loop/i.test(msg.text())) {
      failures.push(`console.error: ${msg.text()}`);
    }
  });
  page.on("response", (response) => {
    const status = response.status();
    const url = response.url();
    if (status >= 500 && !/google|gstatic|fonts\.googleapis/i.test(url)) {
      failures.push(`HTTP ${status}: ${url}`);
    }
  });
  return failures;
}

export async function assertNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(metrics.scroll, `horizontal overflow: scrollWidth=${metrics.scroll}, viewport=${metrics.viewport}`).toBeLessThanOrEqual(metrics.viewport + 2);
}

export async function scrollWholePage(page) {
  await page.evaluate(async () => {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const root = document.scrollingElement || document.documentElement;
    const max = Math.max(0, root.scrollHeight - window.innerHeight);
    for (let y = 0; y <= max; y += Math.max(250, Math.floor(window.innerHeight * 0.7))) {
      window.scrollTo(0, y);
      await delay(30);
    }
    window.scrollTo(0, max);
    await delay(60);
    window.scrollTo(0, 0);
  });
}

export async function clickSafeControls(page, limit = 30) {
  const blocked = /delete|remove|disable|deactivate|refund|void|cancel sale|pay|checkout|send|install|uninstall|reset|sign out|logout|close till|cash out|submit|approve|reject/i;
  const buttons = page.getByRole("button");
  const count = Math.min(await buttons.count(), limit);
  for (let i = 0; i < count; i += 1) {
    const button = buttons.nth(i);
    if (!(await button.isVisible().catch(() => false)) || !(await button.isEnabled().catch(() => false))) continue;
    const label = ((await button.getAttribute("aria-label")) || (await button.textContent()) || "").trim();
    if (!label || blocked.test(label)) continue;
    try {
      await button.click({ timeout: 2000 });
      await page.waitForTimeout(80);
      if (await page.getByRole("dialog").isVisible().catch(() => false)) {
        const close = page.getByRole("button", { name: /close|cancel|back/i }).first();
        if (await close.isVisible().catch(() => false)) await close.click().catch(() => {});
      }
    } catch {}
  }
}
