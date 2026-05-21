import { expect, test } from "@playwright/test";
import { productNavigation } from "@/lib/product/dashboard";

test("product dashboard renders seeded owner workflow checkpoints", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "SignalStack SMS" })).toBeVisible();
  await expect(page.getByText("Daily workspace for managing contacts")).toBeVisible();
  await expect(page.getByRole("link", { name: "Demo Console" })).toHaveAttribute("href", "/demo");
  await expect(page.getByRole("link", { name: "Go-Live Settings" })).toHaveAttribute("href", "/settings");

  for (const item of productNavigation) {
    await expect(page.getByRole("link", { name: item.label }).first()).toHaveAttribute("href", item.href);
  }

  const metrics = page.getByLabel("Product metrics");
  await expect(metrics.getByText("Active Contacts")).toBeVisible();
  await expect(metrics.getByText(/\d+ opted in/)).toBeVisible();
  await expect(metrics.getByText("Campaigns")).toBeVisible();
  await expect(metrics.getByText(/\d+ drafts/)).toBeVisible();
  await expect(metrics.getByText("Open Conversations")).toBeVisible();
  await expect(metrics.getByText(/\d+ messages/)).toBeVisible();
  await expect(metrics.getByText("Templates")).toBeVisible();
  await expect(metrics.getByText("ready for campaign copy")).toBeVisible();

  const contacts = page.locator("#contacts");
  await expect(contacts.getByRole("heading", { name: "Contacts" })).toBeVisible();
  await expect(contacts.getByText("Active contacts")).toBeVisible();
  await expect(contacts.getByText("Opted in")).toBeVisible();
  await expect(contacts.getByText("Opted out")).toBeVisible();

  const compliance = page.locator("#compliance");
  await expect(compliance.getByRole("heading", { name: "Compliance" })).toBeVisible();
  await expect(compliance.getByText("Profile fields")).toBeVisible();
  await expect(compliance.getByText("5/5")).toBeVisible();
  await expect(compliance.getByText("A2P status")).toBeVisible();
  await expect(compliance.getByText("NOT_STARTED")).toBeVisible();
  await expect(compliance.getByText("blocked by default")).toBeVisible();

  const campaigns = page.locator("#campaigns");
  await expect(campaigns.getByRole("heading", { name: "Campaigns" })).toBeVisible();
  await expect(campaigns.getByText("Total campaigns")).toBeVisible();
  await expect(campaigns.getByText("Drafts")).toBeVisible();
  await expect(campaigns.getByText("Scheduled")).toBeVisible();

  const inbox = page.locator("#inbox");
  await expect(inbox.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await expect(inbox.getByText("Open threads")).toBeVisible();
  await expect(inbox.getByText("Local messages")).toBeVisible();
  await expect(inbox.getByText("Provider sends")).toBeVisible();
  await expect(inbox.getByText("disabled")).toBeVisible();

  const templates = page.locator("#templates");
  await expect(templates.getByRole("heading", { name: "Templates" })).toBeVisible();
  await expect(templates.getByText("Saved templates")).toBeVisible();
  await expect(templates.getByText("fake by default")).toBeVisible();
  await expect(templates.getByText("Live AI")).toBeVisible();
  await expect(templates.getByText("blocked")).toBeVisible();

  const analytics = page.locator("#analytics");
  await expect(analytics.getByRole("heading", { name: "Analytics" })).toBeVisible();
  await expect(analytics.getByText("Consent coverage")).toBeVisible();
  await expect(analytics.getByText(/\d+\/\d+/)).toBeVisible();
  await expect(analytics.getByText("Scheduled work")).toBeVisible();
  await expect(analytics.getByText("Inbox load")).toBeVisible();
});

test("product contacts page lists seeded contacts and imports local CSV rows", async ({ page }) => {
  await page.goto("/dashboard/contacts");

  await expect(page.getByRole("heading", { name: "Audience workspace" })).toBeVisible();
  await expect(page.getByLabel("Contact metrics").getByText("Active Contacts")).toBeVisible();
  await expect(page.getByText("Ada Lovelace")).toBeVisible();
  await expect(page.getByText("+15555550100")).toBeVisible();
  await expect(page.getByRole("heading", { name: "CSV import" })).toBeVisible();

  await page.getByLabel("CSV rows").fill(`phone,email,first_name,last_name,consent_status,opt_in_source,tags,lists
+15555550156,jordan@example.com,Jordan,Lee,OPTED_IN,product_e2e,trial,Demo Leads`);
  await page.getByRole("button", { name: "Import Contacts" }).click();

  await expect(page.getByRole("status")).toContainText("Imported 1 of 1 rows");
  const importedRow = page.getByRole("row").filter({ hasText: "Jordan Lee" });
  await expect(importedRow).toBeVisible();
  await expect(importedRow.getByText("+15555550156")).toBeVisible();
  await expect(importedRow.getByText("trial")).toBeVisible();
});

test("product campaigns page creates, preflights, and schedules a local campaign", async ({ page }) => {
  const campaignName = `Product E2E campaign ${Date.now()}`;

  await page.goto("/dashboard/campaigns");

  await expect(page.getByRole("heading", { name: "Campaign workspace" })).toBeVisible();
  await expect(page.getByLabel("Campaign metrics").getByText("Ready Recipients")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Composer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Campaign status" })).toBeVisible();
  await expect(page.getByText("Demo intro campaign")).toBeVisible();

  await page.getByLabel("Campaign name").fill(campaignName);
  await page.getByRole("button", { name: "Save Draft And Preflight" }).click();

  await expect(page.getByRole("status")).toContainText("Draft saved");
  const preflight = page.getByLabel("Campaign preflight");
  await expect(preflight.getByText("Allowed recipients")).toBeVisible();
  await expect(preflight.getByText("blocked by default")).toBeVisible();

  await page.getByRole("button", { name: "Schedule Locally" }).click();
  await expect(page.getByRole("status")).toContainText("Campaign scheduled locally");
  await expect(page.getByRole("row").filter({ hasText: campaignName }).getByText("SCHEDULED")).toBeVisible();
});

test("product inbox page manages a local conversation thread", async ({ page }) => {
  const noteBody = `Product E2E note ${Date.now()}: STOP should remain local and update consent.`;

  await page.goto("/dashboard/inbox");

  await expect(page.getByRole("heading", { name: "Inbox workspace" })).toBeVisible();
  await expect(page.getByLabel("Inbox metrics").getByText("Open Threads")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Conversation list" })).toBeVisible();
  await expect(page.getByText("Ada Lovelace")).toBeVisible();
  await expect(page.getByText("Can you send pricing?")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Thread" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Demo inbound" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Internal note" })).toBeVisible();

  await page.getByLabel("Reply body").fill("STOP");
  await page.getByRole("button", { name: "Add Local Reply" }).click();
  await expect(page.getByRole("status")).toContainText("Local inbound reply added");
  await expect(page.getByText("STOP").first()).toBeVisible();

  await page.getByLabel("Note body").fill(noteBody);
  await page.getByRole("button", { name: "Add Note" }).click();
  await expect(page.getByRole("status")).toContainText("Internal note added");
  await expect(page.getByRole("article").filter({ hasText: noteBody })).toBeVisible();

  await page.getByRole("button", { name: "Resolve" }).click();
  await expect(page.getByRole("status")).toContainText("Conversation resolved");
  await expect(page.getByText("RESOLVED").first()).toBeVisible();

  await page.getByRole("button", { name: "Reopen" }).click();
  await expect(page.getByRole("status")).toContainText("Conversation reopened");
  await expect(page.getByText("OPEN").first()).toBeVisible();
});
