import { expect, test } from "@playwright/test";

test("Milestone 0 home page renders demo-safe defaults", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SignalStack SMS" })).toBeVisible();
  await expect(page.getByText("DEMO_MODE")).toBeVisible();
  await expect(page.getByText("MESSAGING_PROVIDER")).toBeVisible();
});
