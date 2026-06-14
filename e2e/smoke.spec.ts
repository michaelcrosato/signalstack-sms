import { expect, test } from "@playwright/test";
import { getLaunchDashboardLinks } from "@/lib/operations/operator-surfaces";

const launchDashboardLinks = getLaunchDashboardLinks();

test("home page renders local launch dashboard and demo-safe defaults", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SignalStack SMS" })).toBeVisible();
  await expect(page.getByText("Local Launch Dashboard")).toBeVisible();
  for (const link of launchDashboardLinks) {
    await expect(page.getByRole("link", { name: link.label })).toBeVisible();
  }
  await expect(page.getByText("DEMO_MODE")).toBeVisible();
  await expect(page.getByText("MESSAGING_PROVIDER")).toBeVisible();
});
