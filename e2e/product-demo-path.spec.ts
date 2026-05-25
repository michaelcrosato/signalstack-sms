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

  const nextSteps = page.locator("#next-steps");
  await expect(nextSteps.getByRole("heading", { name: "Next Steps" })).toBeVisible();
  await expect(nextSteps.getByRole("link", { name: /Review open replies/ })).toHaveAttribute("href", "/dashboard/inbox");
  await expect(nextSteps.getByRole("link", { name: /Prepare campaign/ })).toHaveAttribute("href", "/dashboard/campaigns");
  await expect(nextSteps.getByRole("link", { name: /Check go-live blockers/ })).toHaveAttribute(
    "href",
    "/dashboard/compliance"
  );
  await expect(nextSteps.getByText("live messaging remains blocked")).toBeVisible();

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
  await expect(page.getByRole("link", { name: "Compliance" }).first()).toHaveAttribute("href", "/dashboard/compliance");

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
  await expect(analytics.getByText("Opt-in rate")).toBeVisible();
  await expect(analytics.getByText(/\d+%/)).toHaveCount(2);
  await expect(analytics.getByText("Scheduled work")).toBeVisible();
  await expect(analytics.getByText("Delivery rate")).toBeVisible();
  await expect(analytics.getByText("Delivery pending")).toBeVisible();
  await expect(analytics.getByText("Delivery failures")).toBeVisible();
  await expect(analytics.getByText("Inbox load")).toBeVisible();
  await expect(analytics.getByText("Fake AI requests")).toBeVisible();
  await expect(analytics.getByText("Local usage events")).toBeVisible();
});

test("product contacts page lists seeded contacts and imports local CSV rows", async ({ page }) => {
  await page.goto("/dashboard/contacts");

  await expect(page.getByRole("heading", { name: "Audience workspace" })).toBeVisible();
  await expect(page.getByLabel("Contact metrics").getByText("Active Contacts")).toBeVisible();
  await expect(page.getByText("Ada Lovelace")).toBeVisible();
  await expect(page.getByText("+15555550100")).toBeVisible();
  await expect(page.getByRole("heading", { name: "CSV import" })).toBeVisible();

  const importCsv = `phone,email,first_name,last_name,consent_status,opt_in_source,tags,lists
+15555550156,jordan@example.com,Jordan,Lee,OPTED_IN,product_e2e,trial,Demo Leads`;
  await page.getByLabel("CSV rows").evaluate((element, value) => {
    const textarea = element as HTMLTextAreaElement;
    textarea.value = value;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }, importCsv);
  await page.getByRole("button", { name: "Import Contacts" }).click();

  await expect(page.getByRole("status")).toContainText("Imported 1 of 1 rows");
  const importedRow = page.getByRole("row").filter({ hasText: "Jordan Lee" });
  await expect(importedRow).toBeVisible();
  await expect(importedRow.getByText("+15555550156")).toBeVisible();
  await expect(importedRow.getByText("trial")).toBeVisible();
});

test("product contact detail page updates local profile and consent metadata", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-7);
  const phone = `+1555${uniqueSuffix}`;
  const displayName = `Product Detail ${uniqueSuffix}`;
  const updatedName = `Product Detail Updated ${uniqueSuffix}`;

  await page.request.post("/api/contacts", {
    data: {
      phone,
      email: `detail-${uniqueSuffix}@example.com`,
      displayName,
      consentStatus: "UNKNOWN",
      source: "product_e2e",
      tagNames: ["detail"],
      listNames: ["Product Detail"]
    }
  });

  await page.goto("/dashboard/contacts");
  const createdRow = page.getByRole("row").filter({ hasText: displayName });
  await expect(createdRow).toBeVisible();
  await createdRow.getByRole("link", { name: `View ${displayName}` }).click();

  await expect(page.getByRole("heading", { name: displayName })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Profile and consent" })).toBeVisible();
  await page.getByLabel("Display name").fill(updatedName);
  await page.getByLabel("Consent status").selectOption("OPTED_IN");
  await page.getByLabel("Opt-in source").fill("product_detail_e2e");
  await page.getByLabel("Tags").fill("detail, updated");
  await page.getByLabel("Lists").fill("Product Detail, Updated Contacts");
  await page.getByLabel("Notes").fill("Local profile update from product detail E2E.");
  await page.getByRole("button", { name: "Save Contact" }).click();

  await expect(page.getByRole("status")).toContainText("Contact updated locally");
  await expect(page.getByLabel("Consent status")).toHaveValue("OPTED_IN");
  await expect(page.getByLabel("Tags")).toHaveValue("detail, updated");
  await expect(page.getByLabel("Lists")).toHaveValue("Product Detail, Updated Contacts");
  await expect(page.getByRole("heading", { name: "Safety Boundary" })).toBeVisible();
  await expect(page.getByText("It does not send SMS, call providers")).toBeVisible();

  await page.getByRole("button", { name: "Archive Contact" }).click();
  await expect(page).toHaveURL(/\/dashboard\/contacts$/);
  await expect(page.getByRole("heading", { name: "Archived contacts" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: updatedName })).toBeVisible();
  await page.getByRole("link", { name: `Restore ${updatedName}` }).click();
  await expect(page.getByRole("heading", { name: updatedName })).toBeVisible();
  await expect(page.getByLabel("Contact status").getByText("Archived").locator("..")).toContainText("yes");
  await page.getByRole("button", { name: "Restore Contact" }).click();
  await expect(page.getByRole("status")).toContainText("Contact restored locally");
  await expect(page.getByLabel("Contact status").getByText("Archived").locator("..")).toContainText("no");
});

test("product contact detail page merges a duplicate contact locally", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-7);
  const targetPhone = `+1666${uniqueSuffix}`;
  const sourcePhone = `+1777${uniqueSuffix}`;
  const targetName = `Merge Target ${uniqueSuffix}`;
  const sourceName = `Merge Source ${uniqueSuffix}`;

  const targetResponse = await page.request.post("/api/contacts", {
    data: {
      phone: targetPhone,
      email: `merge-target-${uniqueSuffix}@example.com`,
      displayName: targetName,
      consentStatus: "UNKNOWN",
      tagNames: ["target-tag"],
      listNames: ["Target List"]
    }
  });
  const sourceResponse = await page.request.post("/api/contacts", {
    data: {
      phone: sourcePhone,
      email: `merge-source-${uniqueSuffix}@example.com`,
      displayName: sourceName,
      consentStatus: "OPTED_IN",
      optInSource: "merge_e2e",
      notes: "Duplicate profile has the newest consent evidence.",
      tagNames: ["source-tag"],
      listNames: ["Source List"]
    }
  });
  const targetPayload = await targetResponse.json();
  const sourcePayload = await sourceResponse.json();

  await page.goto(`/dashboard/contacts/${targetPayload.contact.id}`);

  await expect(page.getByRole("heading", { name: "Merge duplicate" })).toBeVisible();
  await page.getByLabel("Source contact").selectOption(sourcePayload.contact.id);
  await page.getByRole("button", { name: "Merge Into This Contact" }).click();

  await expect(page.getByRole("status")).toContainText("Contacts merged locally");
  await expect(page.getByText("Local metadata only. No provider calls")).toBeVisible();

  await page.goto("/dashboard/contacts");
  await expect(page.getByRole("row").filter({ hasText: targetName }).getByText("source-tag, target-tag")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Archived contacts" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: sourceName })).toBeVisible();

  expect(sourceResponse.ok()).toBe(true);
});

test("product campaigns page creates, preflights, and schedules a local campaign", async ({ page }) => {
  const campaignName = `Product E2E campaign ${Date.now()}`;

  await page.goto("/dashboard/campaigns");

  await expect(page.getByRole("heading", { name: "Campaign workspace" })).toBeVisible();
  await expect(page.getByLabel("Campaign metrics").getByText("Ready Recipients")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Composer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Campaign status" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Readiness" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Delivery" })).toBeVisible();
  await expect(page.getByText("Demo intro campaign")).toBeVisible();
  await expect(page.getByText(/(No outbound evidence|pending; awaiting provider status|failed; review evidence|All delivered)/).first()).toBeVisible();

  await page.getByLabel("Campaign name").fill(campaignName);
  await expect(page.getByRole("heading", { name: "Fake AI copy assist" })).toBeVisible();
  await page.getByLabel("Copy prompt").fill("Invite opted-in leads to book a same-week walkthrough");
  await page.getByRole("button", { name: "Generate Fake Copy" }).click();
  await expect(page.getByRole("status")).toContainText("Fake AI copy generated locally");
  await expect(page.getByText("SignalStack Demo Co: Demo-safe campaign copy")).toBeVisible();
  await page.getByRole("button", { name: "Use Variant 1" }).click();
  await expect(page.getByLabel("Message body")).toHaveValue(/same-week walkthrough/);
  await page.getByRole("button", { name: "Save Draft And Preflight" }).click();

  await expect(page.getByRole("status")).toContainText("Draft saved");
  const preflight = page.getByLabel("Campaign preflight");
  await expect(preflight.getByText("Allowed recipients")).toBeVisible();
  await expect(preflight.locator("dl > div").filter({ hasText: "Allowed recipients" }).locator("dd")).toHaveText(
    /[1-9]\d*/
  );
  await expect(preflight.locator("dl > div").filter({ hasText: "Blocked recipients" }).locator("dd")).toHaveText("0");
  await expect(preflight.getByText("blocked by default")).toBeVisible();

  await page.getByRole("button", { name: "Schedule Locally" }).click();
  await expect(page.getByRole("status")).toContainText("Campaign scheduled locally");
  await expect(page.getByRole("row").filter({ hasText: campaignName }).getByText("SCHEDULED")).toBeVisible();
});

test("product campaign detail page edits a draft and cancels a queued campaign locally", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-7);
  const phone = `+1888${uniqueSuffix}`;
  const campaignName = `Detail campaign ${uniqueSuffix}`;
  const updatedName = `Detail campaign updated ${uniqueSuffix}`;

  const contactResponse = await page.request.post("/api/contacts", {
    data: {
      phone,
      displayName: `Campaign Recipient ${uniqueSuffix}`,
      consentStatus: "OPTED_IN",
      optInSource: "campaign_detail_e2e"
    }
  });
  const contactPayload = await contactResponse.json();
  const campaignResponse = await page.request.post("/api/campaigns", {
    data: {
      name: campaignName,
      body: "Hi {{firstName}}, this local campaign can be edited before scheduling.",
      contactIds: [contactPayload.contact.id]
    }
  });
  const campaignPayload = await campaignResponse.json();

  await page.goto(`/dashboard/campaigns/${campaignPayload.campaign.id}`);

  await expect(page.getByRole("heading", { name: campaignName })).toBeVisible();
  await expect(page.getByLabel("Campaign lifecycle").getByText("DRAFT")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Campaign detail" })).toBeVisible();
  const recipientSnapshot = page.getByRole("heading", { name: "Recipient snapshot" }).locator("..").locator("..");
  const readinessSummary = page.getByLabel("Recipient readiness summary");
  await expect(readinessSummary.getByText("Ready Recipients")).toBeVisible();
  await expect(readinessSummary.getByText("Blocked Recipients")).toBeVisible();
  await expect(readinessSummary.getByText("No blockers")).toBeVisible();
  await expect(recipientSnapshot.getByText("Send State:")).toBeVisible();
  await expect(recipientSnapshot.getByText("PENDING")).toBeVisible();
  await expect(recipientSnapshot.getByText("Block Reason:")).toBeVisible();
  await expect(recipientSnapshot.getByText("none")).toBeVisible();
  const deliverySnapshot = page.getByLabel("Campaign delivery snapshot");
  await expect(deliverySnapshot.getByRole("heading", { name: "Delivery snapshot" })).toBeVisible();
  await expect(deliverySnapshot.getByText("Metrics summarize all outbound local messages")).toBeVisible();
  await expect(deliverySnapshot.getByText("Outbound Messages")).toBeVisible();
  await expect(deliverySnapshot.getByText("Recent Evidence Rows")).toBeVisible();
  await expect(deliverySnapshot.getByText("0 of 0")).toBeVisible();
  await expect(deliverySnapshot.getByText("Delivery Rate")).toBeVisible();
  await expect(deliverySnapshot.getByText("Review Status")).toBeVisible();
  await expect(deliverySnapshot.getByText("No outbound evidence")).toBeVisible();
  await expect(deliverySnapshot.getByText("Last Outbound Message")).toBeVisible();
  await expect(deliverySnapshot.getByText("Provider Statuses")).toBeVisible();
  await expect(deliverySnapshot.getByRole("heading", { name: "Recent outbound evidence" })).toBeVisible();
  await expect(deliverySnapshot.getByText("do not trigger delivery retries or provider calls")).toBeVisible();
  await expect(deliverySnapshot.getByText("No local delivery messages recorded for this campaign.")).toBeVisible();
  await page.getByLabel("Campaign name").fill(updatedName);
  await page.getByRole("button", { name: "Save Draft" }).click();

  await expect(page.getByRole("status")).toContainText("Campaign draft updated locally");
  await expect(page.getByRole("heading", { name: updatedName })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Safety Boundary" })).toBeVisible();
  await expect(page.getByText("It does not send SMS, call")).toBeVisible();

  await page.request.post(`/api/campaigns/${campaignPayload.campaign.id}/schedule`, {
    data: { scheduledAt: new Date(Date.now() + 90 * 60 * 1000).toISOString() }
  });

  await page.goto(`/dashboard/campaigns/${campaignPayload.campaign.id}`);
  await expect(page.getByLabel("Campaign lifecycle").getByText("SCHEDULED")).toBeVisible();
  await page.getByRole("button", { name: "Cancel Scheduled Campaign" }).click();
  await expect(page.getByRole("status")).toContainText("Campaign queue job canceled locally");
  await expect(page.getByLabel("Campaign lifecycle").getByText("PAUSED")).toBeVisible();
});

test("product inbox page manages a local conversation thread", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-7);
  const phone = `+1555${uniqueSuffix}`;
  const newerPhone = `+1666${uniqueSuffix}`;
  const noteBody = `Product E2E note ${Date.now()}: local reply should remain provider-free.`;

  const conversationResponse = await page.request.post("/api/inbox/conversations", {
    data: {
      phone,
      body: "Can you send pricing?"
    }
  });
  const conversationPayload = await conversationResponse.json();
  await page.request.post("/api/inbox/conversations", {
    data: {
      phone: newerPhone,
      body: "Newer thread should not override the requested selection."
    }
  });

  await page.goto(`/dashboard/inbox?conversationId=${conversationPayload.conversation.id}`);

  await expect(page.getByRole("heading", { name: "Inbox workspace" })).toBeVisible();
  await expect(page.getByLabel("Inbox metrics").getByText("Open Threads")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Conversation list" })).toBeVisible();
  await expect(page.getByText(phone).first()).toBeVisible();
  await expect(page.getByLabel(`Open conversation with ${phone}`)).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Can you send pricing?").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Thread" })).toBeVisible();
  await expect(page.getByLabel("Thread status").getByText("Consent")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fake AI insights" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Demo inbound" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Internal note" })).toBeVisible();

  await page.getByRole("button", { name: "Generate Fake AI Insights" }).click();
  await expect(page.getByRole("status")).toContainText("Fake AI inbox insights generated locally");
  await expect(page.getByText("Demo summary:")).toBeVisible();
  await expect(page.getByText("HOT")).toBeVisible();
  await expect(page.getByText("Asked about pricing or quote.")).toBeVisible();

  await page.getByLabel("Reply body").fill("HELP");
  await page.getByRole("button", { name: "Add Local Reply" }).click();
  await expect(page.getByRole("status")).toContainText("Local HELP/INFO request recorded");
  await expect(page.getByRole("status")).toContainText("Consent stayed unchanged");
  await expect(page.getByText("HELP").first()).toBeVisible();
  await expect(page.getByLabel("Thread status").getByText("UNKNOWN")).toBeVisible();

  await page.getByLabel("Reply body").fill("STOP");
  await page.getByRole("button", { name: "Add Local Reply" }).click();
  await expect(page.getByRole("status")).toContainText("Local STOP opt-out recorded");
  await expect(page.getByLabel("Thread status").getByText("OPTED_OUT")).toBeVisible();

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

test("product templates page creates local reusable copy", async ({ page }) => {
  const templateName = `Product E2E template ${Date.now()}`;
  const updatedTemplateName = `${templateName} updated`;

  await page.goto("/dashboard/templates");

  await expect(page.getByRole("heading", { name: "Template workspace" })).toBeVisible();
  await expect(page.getByLabel("Template metrics").getByText("Saved Templates")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Template editor" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved templates" })).toBeVisible();
  await expect(page.getByText("Demo intro")).toBeVisible();

  await page.getByLabel("Template name").fill(templateName);
  await page.getByLabel("Message body").fill("Hi {{firstName}}, {{company}} has a new demo slot. Reply STOP to opt out.");
  await expect(page.getByLabel("Detected variables")).toContainText("company, firstName");

  await page.getByRole("button", { name: "Save Template" }).click();
  await expect(page.getByRole("status")).toContainText("Template saved locally");

  const savedRow = page.getByRole("row").filter({ hasText: templateName });
  await expect(savedRow).toBeVisible();
  await expect(savedRow.getByRole("cell", { name: /^(company, firstName|firstName, company)$/ })).toBeVisible();
  const templateHref = await savedRow.getByRole("link", { name: templateName }).getAttribute("href");
  expect(templateHref).toBeTruthy();
  await page.goto(templateHref!);
  await expect(page.getByRole("heading", { name: templateName })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Template detail" })).toBeVisible();
  await page.getByLabel("Template name").fill(updatedTemplateName);
  await page.getByLabel("Message body").fill("Hi {{firstName}}, {{company}} has a new local detail edit. Reply STOP to opt out.");
  await expect(page.getByLabel("Detected variables")).toContainText("company, firstName");
  await page.getByRole("button", { name: "Save Template" }).click();
  await expect(page.getByRole("status")).toContainText("Template updated locally");
  await expect(page.getByRole("heading", { name: updatedTemplateName })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Safety Boundary" })).toBeVisible();
  await expect(page.getByText("It does not render live outbound messages")).toBeVisible();
});

test("product analytics page renders local overview detail", async ({ page }) => {
  const aiResponse = await page.request.post("/api/ai/campaign-copy", {
    data: {
      prompt: "Summarize local analytics value after fake AI usage",
      businessName: "SignalStack Demo Co"
    }
  });
  expect(aiResponse.ok()).toBe(true);

  await page.goto("/dashboard/analytics");

  await expect(page.getByRole("heading", { name: "Analytics workspace" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");

  const metrics = page.getByLabel("Analytics metrics");
  await expect(metrics.getByText("Consent Coverage")).toBeVisible();
  await expect(metrics.getByText("Campaigns")).toBeVisible();
  await expect(metrics.getByText("Inbox Load")).toBeVisible();
  await expect(metrics.getByText("Usage Events")).toBeVisible();

  await expect(page.getByRole("heading", { name: "Audience Signals" })).toBeVisible();
  await expect(page.getByText("Opt-out share")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Inbox Signals" })).toBeVisible();
  await expect(page.getByText("Resolution rate")).toBeVisible();
  await expect(page.getByText("Average messages per conversation")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Delivery Signals" })).toBeVisible();
  await expect(page.getByText("Outbound messages")).toBeVisible();
  await expect(page.getByText("Delivery rate")).toBeVisible();
  await expect(page.getByText("Delivery source")).toBeVisible();
  await expect(page.getByText("local message rows")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Campaign Signals" })).toBeVisible();
  await expect(page.getByText("Scheduled campaigns")).toBeVisible();
  await expect(page.getByText("Scheduled rate")).toBeVisible();
  await expect(page.getByText("Fake AI usage share")).toBeVisible();
  await expect(page.getByText("Provider sends")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Usage Metering" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Contacts imported" })).toBeVisible();
  const fakeAiUsageRow = page.getByRole("row").filter({ hasText: "Fake AI requests" });
  await expect(fakeAiUsageRow).toBeVisible();
  await expect(fakeAiUsageRow.getByText("AI_REQUEST")).toBeVisible();
  await expect(fakeAiUsageRow.getByRole("cell").last()).toHaveText(/[1-9]\d*/);
  await expect(page.getByRole("heading", { name: "Safety Boundary" })).toBeVisible();
  await expect(page.getByText("It does not execute reports, create exports, mutate records")).toBeVisible();
});

test("product compliance page explains readiness and hard-gate blockers", async ({ page }) => {
  await page.goto("/dashboard/compliance");

  await expect(page.getByRole("heading", { name: "Readiness workspace" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Compliance Settings" })).toHaveAttribute("href", "/settings/compliance");

  const metrics = page.getByLabel("Compliance metrics");
  await expect(metrics.getByText("Profile Fields")).toBeVisible();
  await expect(metrics.getByText("5/5")).toBeVisible();
  await expect(metrics.getByText("A2P Status")).toBeVisible();
  await expect(metrics.getByText("NOT_STARTED")).toBeVisible();
  await expect(metrics.getByText("Live Messaging")).toBeVisible();
  await expect(metrics.getByText("blocked")).toBeVisible();

  await expect(page.getByRole("heading", { name: "Profile Checklist" })).toBeVisible();
  await expect(page.getByText("Business name")).toBeVisible();
  await expect(page.getByText("Privacy policy URL")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Runtime Gates" })).toBeVisible();
  await expect(page.getByText("Dummy provider is selected.")).toBeVisible();
  await expect(page.getByText("A2P registration is not approved.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Safety Boundary" })).toBeVisible();
  await expect(page.getByText("It does not register A2P campaigns, call providers, send SMS")).toBeVisible();
});
