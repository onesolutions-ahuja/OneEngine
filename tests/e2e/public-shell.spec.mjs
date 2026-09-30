import { test, expect } from "@playwright/test";
import { assertNoHorizontalOverflow, scrollWholePage, watchRuntimeFailures } from "./helpers.mjs";

test("login shell loads without runtime failures", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await page.goto("./");
  await expect(page.locator("body")).toBeVisible();
  await scrollWholePage(page);
  await assertNoHorizontalOverflow(page);
  expect(failures, failures.join("\n")).toEqual([]);
});
