import { test, expect } from "@playwright/test";
import { assertNoHorizontalOverflow, loginIfConfigured, watchRuntimeFailures } from "./helpers.mjs";

async function openDemoFlow(page, flowKey) {
  await loginIfConfigured(page);
  await page.goto(`kiosk-runtime?demo=1&flow=${encodeURIComponent(flowKey)}`);
  const start = page.getByRole("button", { name: /start order/i });
  await expect(start).toBeVisible();
  await start.click();
  await expect(page.getByText("Demo catalogue · no live sale or payment is created")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Classic Beef Burger", { exact: true })).toBeVisible({ timeout: 15_000 });
  await assertNoHorizontalOverflow(page);
}

async function proceedFromFulfilmentToPayment(page, loyaltyHeading) {
  await page.getByRole("button", { name: /review order/i }).click();
  await page.getByRole("button", { name: /^Continue$/ }).last().click();

  const skip = page.getByRole("button", { name: /^Skip$/ });
  if (await skip.isVisible().catch(() => false)) await skip.click();

  await expect(page.getByText("Total", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /continue to payment/i }).click();

  await expect(page.getByRole("heading", { name: loyaltyHeading })).toBeVisible();
  await page.getByRole("button", { name: /continue as guest/i }).click();

  await expect(page.getByRole("heading", { name: /pay by card|payment/i })).toBeVisible();
}

test.describe("OneKiosk customer journeys", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !(process.env.ONEPOS_E2E_USERNAME && process.env.ONEPOS_E2E_PASSWORD),
      "Set ONEPOS_E2E_USERNAME and ONEPOS_E2E_PASSWORD GitHub secrets for OneKiosk QA.",
    );
  });

  test("Restaurant Case 1 completes customer demo journey", async ({ page }) => {
    const failures = watchRuntimeFailures(page);
    await openDemoFlow(page, "one_kiosk_case_1_restaurant");

    await expect(page.getByRole("heading", { name: "What would you like?" })).toBeVisible();
    await expect(page.getByText("3 items", { exact: true }).first()).toBeVisible();

    // Verify translations are live, then return to English for the journey.
    const english = page.getByRole("button", { name: /English/i });
    if (await english.isVisible().catch(() => false)) {
      await english.click();
      await expect(page.getByRole("heading", { name: "¿Qué te gustaría?" })).toBeVisible();
      await page.getByRole("button", { name: /Español/i }).click();
      await expect(page.getByRole("heading", { name: "Que souhaitez-vous ?" })).toBeVisible();
      await page.getByRole("button", { name: /Français/i }).click();
      await expect(page.getByRole("heading", { name: "What would you like?" })).toBeVisible();
    }

    await page.getByRole("button", { name: /review order/i }).click();
    await expect(page.getByText("How would you like it?", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Eat in", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Takeaway", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Collect", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Eat in", exact: true }).click();
    await page.getByRole("button", { name: /^Continue$/ }).last().click();
    await expect(page.getByRole("heading", { name: "Order details" })).toBeVisible();
    await expect(page.getByText("Table number", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: /^Skip$/ }).click();

    await page.getByRole("button", { name: /continue to payment/i }).click();
    await expect(page.getByRole("heading", { name: "Rewards" })).toBeVisible();
    await page.getByRole("button", { name: /continue as guest/i }).click();
    await expect(page.getByRole("heading", { name: /pay by card|payment/i })).toBeVisible();

    await page.getByRole("button", { name: /pay & collect|pay now/i }).click();
    await expect(page.getByRole("heading", { name: "Thank you" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/collection number/i)).toBeVisible();
    expect(failures, failures.join("\n")).toEqual([]);
  });

  test("Retail Case 2 completes customer demo journey", async ({ page }) => {
    const failures = watchRuntimeFailures(page);
    await openDemoFlow(page, "one_kiosk_case_2_retail");

    await expect(page.getByRole("heading", { name: "Find your product" })).toBeVisible();
    await page.getByRole("button", { name: /review order/i }).click();

    await expect(page.getByText("Choose fulfilment", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Collect here", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Collect another store", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Home delivery", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Collect here", exact: true }).click();
    await page.getByRole("button", { name: /^Continue$/ }).last().click();
    await expect(page.getByRole("heading", { name: "Extra order details" })).toBeVisible();
    await expect(page.getByText(/Preferred collection \/ delivery slot/i)).toBeVisible();
    await expect(page.getByText(/Installation service/i)).toBeVisible();
    await page.getByRole("button", { name: /^Skip$/ }).click();

    await page.getByRole("button", { name: /continue to payment/i }).click();
    await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
    await page.getByRole("button", { name: /continue as guest/i }).click();
    await expect(page.getByRole("heading", { name: /pay by card|payment/i })).toBeVisible();

    await page.getByRole("button", { name: /pay & order|pay now/i }).click();
    await expect(page.getByRole("heading", { name: "Order confirmed" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/order \/ collection number/i)).toBeVisible();
    expect(failures, failures.join("\n")).toEqual([]);
  });

  test("Kiosk device settings expose workflow, payment and printer assignments", async ({ page }) => {
    const failures = watchRuntimeFailures(page);
    await loginIfConfigured(page);
    await page.goto("kiosk-devices");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByText(/Experience flow/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/One Connect card machine/i).first()).toBeVisible();
    await expect(page.getByText(/One Connect printer/i).first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
    expect(failures, failures.join("\n")).toEqual([]);
  });
});
