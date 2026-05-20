import { expect, test } from "@playwright/test";

test("investor demo path exercises safe product workflow", async ({ page, request }) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "SignalStack Demo Console" })).toBeVisible();
  await expect(page.getByText("Live messaging, live billing, and live AI remain blocked.")).toBeVisible();
  await page.getByRole("link", { name: "Go-Live Readiness" }).click();
  await expect(page.getByRole("heading", { name: "Go-Live Readiness" })).toBeVisible();
  await expect(page.getByText("Twilio Readiness")).toBeVisible();
  await expect(page.getByText("API Protection")).toBeVisible();
  await expect(page.getByText("Credential Rotation History")).toBeVisible();
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
