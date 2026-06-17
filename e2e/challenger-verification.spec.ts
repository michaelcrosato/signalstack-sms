import { expect, test } from "@playwright/test";

test.describe("Challenger verification", () => {
  test("Requirement 1: Contact fields (firstName, lastName, displayName, notes) can be cleared to null/empty without validation failures", async ({ page }) => {
    const uniqueSuffix = Date.now().toString().slice(-7);
    const phone = `+1555888${uniqueSuffix}`;
    const initialEmail = `challenger-${uniqueSuffix}@example.com`;

    // 1. Create a contact with initial values
    const createResponse = await page.request.post("/api/contacts", {
      data: {
        phone,
        email: initialEmail,
        firstName: "InitialFirst",
        lastName: "InitialLast",
        displayName: "InitialDisplay",
        notes: "InitialNotes",
        consentStatus: "UNKNOWN",
        source: "challenger_test",
        tagNames: ["test"],
        listNames: ["Test List"]
      }
    });

    expect(createResponse.ok()).toBe(true);
    const payload = await createResponse.json();
    const contactId = payload.contact.id;

    // Verify initial database state via GET API
    const getResponse1 = await page.request.get(`/api/contacts/${contactId}`);
    expect(getResponse1.ok()).toBe(true);
    const initialContact = (await getResponse1.json()).contact;
    expect(initialContact.firstName).toBe("InitialFirst");
    expect(initialContact.lastName).toBe("InitialLast");
    expect(initialContact.displayName).toBe("InitialDisplay");
    expect(initialContact.notes).toBe("InitialNotes");

    // 2. Navigate to the contact detail page in the UI
    await page.goto(`/dashboard/contacts/${contactId}`);
    await expect(page.getByRole("heading", { name: "InitialDisplay" })).toBeVisible();

    // 3. Clear all fields in the form
    await page.getByLabel("First name").fill("");
    await page.getByLabel("Last name").fill("");
    await page.getByLabel("Display name").fill("");
    await page.getByLabel("Notes").fill("");

    // 4. Submit the form
    await page.getByRole("button", { name: "Save Contact" }).click();

    // 5. Assert successful update in UI (status message)
    await expect(page.getByRole("status")).toContainText("Contact updated locally");

    // 6. Assert in DB that all cleared fields are null
    const getResponse2 = await page.request.get(`/api/contacts/${contactId}`);
    expect(getResponse2.ok()).toBe(true);
    const updatedContact = (await getResponse2.json()).contact;
    expect(updatedContact.firstName).toBeNull();
    expect(updatedContact.lastName).toBeNull();
    expect(updatedContact.displayName).toBeNull();
    expect(updatedContact.notes).toBeNull();
  });

  test("Requirement 2: CampaignComposer handles duplicate copy variants without warnings or errors", async ({ page }) => {
    // 1. Catch console logs
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    // 2. Route the campaign-copy API call to return duplicate variants
    await page.route("**/api/ai/campaign-copy", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          provider: "fake",
          variants: [
            "SignalStack Demo: This is duplicate variant text.",
            "SignalStack Demo: This is duplicate variant text."
          ]
        })
      });
    });

    // 3. Navigate to campaigns page
    await page.goto("/dashboard/campaigns");
    await expect(page.getByRole("heading", { name: "Campaign workspace" })).toBeVisible();

    // 4. Fill prompt and click generate fake copy
    await page.getByLabel("Campaign name").fill("Duplicate Test Campaign");
    await page.getByLabel("Copy prompt").fill("Test duplicate variants");
    await page.getByRole("button", { name: "Generate Fake Copy" }).click();

    // 5. Verify local generation status and variants display
    await expect(page.getByRole("status")).toContainText("Fake AI copy generated locally");
    await expect(page.getByText("SignalStack Demo: This is duplicate variant text.").first()).toBeVisible();

    // 6. Check console logs for React key warnings or other errors
    const warnings = consoleLogs.filter((log) => 
      (log.includes("warning") || log.includes("key")) && log.includes("each child in a list")
    );
    console.log("Captured console logs:", consoleLogs);
    expect(warnings.length).toBe(0);
  });
});
