import { test, expect } from "@playwright/test";

const username = process.env.ONEPOS_E2E_USERNAME || process.env.PLAYWRIGHT_USERNAME || "";
const password = process.env.ONEPOS_E2E_PASSWORD || process.env.PLAYWRIGHT_PASSWORD || "";

test.describe("onePOS regression smoke", () => {
  test("public shell loads without a fatal client error", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto("./");
    await expect(page.locator("main.screen")).toBeVisible();
    await expect(page.getByLabel("Login screen")).toBeVisible();
    await expect(page.getByPlaceholder("Email or username")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("invalid login fails visibly instead of hanging", async ({ page }) => {
    await page.goto("./");
    await page.getByPlaceholder("Email or username").fill("e2e-invalid@onepos.invalid");
    await page.getByLabel("Password", { exact: true }).fill("invalid-password");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.locator(".login-error")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeEnabled();
  });

  test("authenticated core surfaces load when E2E credentials are configured", async ({ page }) => {
    test.skip(!username || !password, "Set ONEPOS_E2E_USERNAME and ONEPOS_E2E_PASSWORD for authenticated regression.");
    await page.goto("./");
    await page.getByPlaceholder("Email or username").fill(username);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByLabel("Login screen")).toBeHidden({ timeout: 30_000 });
    await expect(page.locator("body")).toContainText(/Dashboard|Till|Products|Sales/i);
  });
});
