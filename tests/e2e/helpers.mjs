import { expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const SESSION_CACHE_FILE = path.resolve("test-results/.auth/browser-session.json");
let cachedBrowserSession = null;
let cachedBrowserSessionValidated = false;

async function loadBrowserSession() {
  if (cachedBrowserSession) return cachedBrowserSession;
  try {
    cachedBrowserSession = JSON.parse(await fs.readFile(SESSION_CACHE_FILE, "utf8"));
  } catch {
    cachedBrowserSession = null;
  }
  return cachedBrowserSession;
}

async function captureBrowserSession(page) {
  cachedBrowserSession = await page.evaluate(() => ({
    session: Object.fromEntries(Object.entries(sessionStorage)),
    local: Object.fromEntries(Object.entries(localStorage)),
  }));
  await fs.mkdir(path.dirname(SESSION_CACHE_FILE), { recursive: true });
  await fs.writeFile(SESSION_CACHE_FILE, JSON.stringify(cachedBrowserSession), "utf8");
}

async function restoreBrowserSession(page) {
  const state = await loadBrowserSession();
  if (!state) return false;
  await page.addInitScript((state) => {
    for (const [key, value] of Object.entries(state.session || {})) sessionStorage.setItem(key, value);
    for (const [key, value] of Object.entries(state.local || {})) localStorage.setItem(key, value);
  }, state);
  await page.goto("./");
  const apiBaseUrl = String(process.env.ONEPOS_API_URL || "https://oneengine-6gas.onrender.com").replace(/\/$/, "");
  if (!cachedBrowserSessionValidated) {
    const validation = await page.evaluate(async ({ apiBaseUrl }) => {
      const token = sessionStorage.getItem("onepos_token") || localStorage.getItem("onepos_token");
      if (!token) return { valid: false, status: 0 };
      try {
        const response = await fetch(`${apiBaseUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return { valid: response.ok, status: response.status };
      } catch {
        return { valid: false, status: 0 };
      }
    }, { apiBaseUrl });
    if (!validation.valid) {
      cachedBrowserSession = null;
      cachedBrowserSessionValidated = false;
      await fs.rm(SESSION_CACHE_FILE, { force: true }).catch(() => {});
      await page.evaluate(() => {
        sessionStorage.removeItem("onepos_token");
        sessionStorage.removeItem("onepos_user");
        localStorage.removeItem("onepos_token");
        localStorage.removeItem("onepos_user");
      });
      return false;
    }
    cachedBrowserSessionValidated = true;
  }
  await expect(page.getByPlaceholder("Email or username")).toBeHidden({ timeout: 15_000 });
  return true;
}

export async function loginIfConfigured(page) {
  const username = process.env.ONEPOS_E2E_USERNAME || "";
  const password = process.env.ONEPOS_E2E_PASSWORD || "";
  if (!username || !password) return false;

  // Persist the issued browser session to disk as well as memory. Playwright
  // may replace a worker process after a failed test/retry; an in-memory cache
  // disappears with that worker and would otherwise cause another production
  // login for every retry until the API rate limiter returns 429. sessionStorage
  // is not included in Playwright's native storageState, so restore it explicitly.
  if (await restoreBrowserSession(page)) return true;

  await page.goto("./");
  const usernameField = page.getByPlaceholder("Email or username");
  if (await usernameField.isVisible().catch(() => false)) {
    await usernameField.fill(username);
    await page.getByPlaceholder("Password").fill(password);

    await page.getByRole("button", { name: /^Sign In$/ }).click();

    await expect.poll(
      () => page.evaluate(() => ({
        token: Boolean(sessionStorage.getItem("onepos_token")),
        error: document.querySelector(".login-error")?.textContent?.trim() || "",
      })),
      { timeout: 35_000, message: "Login did not establish a session" },
    ).toMatchObject({ token: true });

    await expect(usernameField).toBeHidden({ timeout: 15_000 });
    await captureBrowserSession(page);
    cachedBrowserSessionValidated = true;
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
    // Include 4xx URLs as well as 5xx. Chromium's console message for a failed
    // resource omits the URL, which made CI report an unactionable generic 404.
    // Ignore only known third-party resources; application/API failures remain fatal.
    if (status >= 400 && !/google|gstatic|fonts\.googleapis/i.test(url)) {
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
  const blocked = /delete|remove|disable|deactivate|activate|enable|refund|void|cancel sale|pay|checkout|send|install|uninstall|reset|revoke|disconnect|terminate|expire|unlock|save|create|update|apply/i;
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
