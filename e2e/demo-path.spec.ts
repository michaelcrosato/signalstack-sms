import { expect, test } from "@playwright/test";

test("investor demo path exercises safe product workflow", async ({ page, request }) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "SignalStack Demo Console" })).toBeVisible();
  await expect(page.getByText("Live messaging, live billing, and live AI remain blocked.")).toBeVisible();
  await page.getByRole("link", { name: "System Status" }).click();
  await expect(page.getByRole("heading", { name: "System Status" })).toBeVisible();
  await expect(page.getByText("Safety Defaults")).toBeVisible();
  await expect(page.getByText("Runtime")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Queue" })).toBeVisible();
  await expect(page.getByText("API Protection")).toBeVisible();
  await page.getByRole("link", { name: "Operator Runbook" }).click();
  await expect(page.getByRole("heading", { name: "Operator Runbook" })).toBeVisible();
  await expect(page.getByText("Daily Local Start")).toBeVisible();
  await expect(page.getByText("Repair Loop")).toBeVisible();
  await expect(page.getByText("Command execution")).toBeVisible();
  await page.getByRole("link", { name: "Usage & Analytics" }).click();
  await expect(page.getByRole("heading", { name: "Usage & Analytics" })).toBeVisible();
  await expect(page.getByText("Local Usage Totals")).toBeVisible();
  await expect(page.getByText("Billing Boundary")).toBeVisible();
  await expect(page.getByText("Recent Usage Events")).toBeVisible();
  await page.getByRole("link", { name: "Campaign Operations" }).click();
  await expect(page.getByRole("heading", { name: "Campaign Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Campaign Status" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Queue Status" })).toBeVisible();
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "Go-Live Readiness" }).click();
  await expect(page.getByRole("heading", { name: "Go-Live Readiness" })).toBeVisible();
  await expect(page.getByText("Twilio Readiness")).toBeVisible();
  await expect(page.getByText("API Protection")).toBeVisible();
  await expect(page.getByText("Credential Rotation History")).toBeVisible();
  await expect(page.getByRole("link", { name: "Export CSV" })).toBeVisible();
  await page.getByRole("link", { name: "Compliance Detail" }).first().click();
  await expect(page.getByRole("heading", { name: "Compliance Detail" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Compliance Profile" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hard Gate" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Compliance Audit" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Export Compliance CSV" })).toBeVisible();
  const complianceAuditExportResponse = await request.get("/api/settings/readiness-audit/export?subjectType=ComplianceProfile&limit=5");
  expect(complianceAuditExportResponse.ok()).toBeTruthy();
  await expect(complianceAuditExportResponse.text()).resolves.toContain("id,action,subjectType,subjectId,actorUserId,createdAt,metadata");
  await page.getByRole("link", { name: "Go-Live Readiness" }).click();
  await page.getByRole("link", { name: "Provider Numbers" }).first().click();
  await expect(page.getByRole("heading", { name: "Provider Numbers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Number Metadata" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Safety Boundary" })).toBeVisible();
  await expect(page.getByText("+15555550199").first()).toBeVisible();
  await page.getByRole("link", { name: "Go-Live Readiness" }).click();
  await page.getByRole("link", { name: "Admin Exports" }).click();
  await expect(page.getByRole("heading", { name: "Admin Exports" })).toBeVisible();
  await expect(page.getByText("Export Safety Boundary")).toBeVisible();
  await expect(page.getByRole("link", { name: "Export CSV" })).toHaveCount(2);
  await page.getByRole("link", { name: "Go-Live Readiness" }).click();
  const readinessAuditExportResponse = await request.get("/api/settings/readiness-audit/export?limit=5");
  expect(readinessAuditExportResponse.ok()).toBeTruthy();
  await expect(readinessAuditExportResponse.text()).resolves.toContain("id,action,subjectType,subjectId,actorUserId,createdAt,metadata");
  await page.getByRole("link", { name: "Provider Details" }).click();
  await expect(page.getByRole("heading", { name: "Provider Details" })).toBeVisible();
  await expect(page.getByText("Twilio Metadata")).toBeVisible();
  await page.getByLabel("Account SID").fill("AC111122223333");
  await page.getByLabel("Auth token").fill("demo_token_value_10");
  await page.getByLabel("From number").fill("+15555550198");
  await page.getByRole("button", { name: "Save Metadata" }).click();
  await expect(page.locator("dd").filter({ hasText: "redacted_0198" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear Metadata" })).toBeDisabled();
  await page.getByLabel("Clear only local readiness metadata; no provider-side credential is revoked.").check();
  await page.getByRole("button", { name: "Clear Metadata" }).click();
  await expect(page.getByText("Metadata cleared locally.")).toBeVisible();
  await page.getByRole("link", { name: "DELETED" }).click();
  await expect(page.getByText("DELETED / twilio / not stored").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Export Rotations CSV" })).toBeVisible();
  const rotationExportResponse = await request.get("/api/settings/provider/rotations/export?action=DELETED&limit=5");
  expect(rotationExportResponse.ok()).toBeTruthy();
  await expect(rotationExportResponse.text()).resolves.toContain("id,provider,action,providerCredentialId,actorUserId,accountSidRedacted");
  await page.goto("/demo");

  const importResponse = await request.post("/api/contacts/imports", {
    data: {
      filename: "investor-demo.csv",
      csv: "phone,email,first_name,last_name,consent_status,opt_in_source,tags,lists\n+15555550901,grace@example.com,Grace,Hopper,OPTED_IN,demo_form,investor,Demo Leads"
    }
  });
  expect(importResponse.ok()).toBeTruthy();
  await expect(importResponse.json()).resolves.toMatchObject({
    summary: {
      importedRows: 1,
      failedRows: 0
    }
  });

  const contactsResponse = await request.get("/api/contacts");
  const contactsJson = await contactsResponse.json();
  const contact = contactsJson.contacts.find((item: { phone: string }) => item.phone === "+15555550901");
  expect(contact?.id).toBeTruthy();

  const campaignResponse = await request.post("/api/campaigns", {
    data: {
      name: "Investor demo campaign",
      body: "Hi {{firstName}}, this is a demo-safe SignalStack update. Reply STOP to opt out.",
      contactIds: [contact.id]
    }
  });
  expect(campaignResponse.ok()).toBeTruthy();
  const campaignJson = await campaignResponse.json();

  const preflightResponse = await request.post(`/api/campaigns/${campaignJson.campaign.id}/preflight`, {
    data: {}
  });
  await expect(preflightResponse.json()).resolves.toMatchObject({
    preflight: {
      allowed: true,
      allowedRecipients: 1
    }
  });

  const scheduleResponse = await request.post(`/api/campaigns/${campaignJson.campaign.id}/schedule`, {
    data: {
      scheduledAt: "2027-01-01T17:00:00.000Z"
    }
  });
  expect(scheduleResponse.status()).toBe(201);

  const helpResponse = await request.post("/api/demo/inbound", {
    data: {
      phone: "+15555550902",
      body: "HELP"
    }
  });
  await expect(helpResponse.json()).resolves.toMatchObject({ keywordAction: "HELP" });

  const stopResponse = await request.post("/api/demo/inbound", {
    data: {
      phone: "+15555550903",
      body: "STOP"
    }
  });
  await expect(stopResponse.json()).resolves.toMatchObject({ keywordAction: "OPT_OUT" });

  const aiResponse = await request.post("/api/ai/lead-qualification", {
    data: {
      messages: [{ direction: "INBOUND", body: "Can you send pricing?" }]
    }
  });
  await expect(aiResponse.json()).resolves.toMatchObject({
    provider: "fake",
    stage: "HOT"
  });

  const analyticsResponse = await request.get("/api/analytics/overview");
  const analyticsJson = await analyticsResponse.json();
  expect(analyticsJson.overview.contacts.total).toBeGreaterThanOrEqual(1);

  const usageResponse = await request.post("/api/billing/usage", {
    data: {
      type: "AI_REQUEST",
      quantity: 1,
      metadata: { source: "demo_path" }
    }
  });
  const usageJson = await usageResponse.json();
  expect(usageJson.usage.liveBillingBlocked).toBe(true);
});
