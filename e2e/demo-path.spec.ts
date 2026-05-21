import { expect, test } from "@playwright/test";
import {
  getDemoOperationsCheckpoints,
  getDemoOperationsLinks,
  getDemoConsoleLinks,
  getContractOperationLinks,
  getEnvironmentOperationLinks,
  getExportOperationLinks,
  getHealthOperationLinks,
  getIntegrationOperationAreas,
  getNotificationOperationLinks,
  getQueueOperationLinks,
  getReleaseOperationSurfaceLinks,
  getReportingIndexLinks,
  getSecurityOperationLinks,
  getSettingsNavigationLinks,
  getTeamOperationLinks,
  getValidationOperationLinks,
  getDeliveryOperationLinks,
  getWebhookOperationLinks,
  getWorkflowOperationSteps,
  operatorSurfaceGroups
} from "@/lib/operations/operator-surfaces";

const operationSurfaceLinks = operatorSurfaceGroups.flatMap((group) => group.links);
const demoConsoleLinks = getDemoConsoleLinks();
const demoOperationsCheckpoints = getDemoOperationsCheckpoints();
const demoOperationsLinks = getDemoOperationsLinks();
const settingsNavigationLinks = getSettingsNavigationLinks();
const reportingIndexLinks = getReportingIndexLinks();
const workflowOperationSteps = getWorkflowOperationSteps();
const releaseOperationSurfaceLinks = getReleaseOperationSurfaceLinks();
const integrationOperationAreas = getIntegrationOperationAreas();
const securityOperationLinks = getSecurityOperationLinks();
const environmentOperationLinks = getEnvironmentOperationLinks();
const healthOperationLinks = getHealthOperationLinks();
const contractOperationLinks = getContractOperationLinks();
const validationOperationLinks = getValidationOperationLinks();
const queueOperationLinks = getQueueOperationLinks();
const notificationOperationLinks = getNotificationOperationLinks();
const exportOperationLinks = getExportOperationLinks();
const webhookOperationLinks = getWebhookOperationLinks();
const deliveryOperationLinks = getDeliveryOperationLinks();
const teamOperationLinks = getTeamOperationLinks();

test.setTimeout(60_000);

test("investor demo path exercises safe product workflow", async ({ page, request }) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "SignalStack Demo Console" })).toBeVisible();
  await expect(page.getByText("Live messaging, live billing, and live AI remain blocked.")).toBeVisible();
  for (const link of demoConsoleLinks) {
    await expect(page.getByRole("link", { name: link.label }).first()).toBeVisible();
  }
  await page.getByRole("link", { name: "Demo Operations" }).first().click();
  await expect(page.getByRole("heading", { name: "Demo Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Demo Readiness" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Runtime Gates" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Seed Signals" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Scenario Signals" })).toBeVisible();
  const demoReadinessList = page.locator("ol");
  for (const checkpoint of demoOperationsCheckpoints) {
    await expect(page.getByRole("link", { name: checkpoint.name })).toHaveAttribute("href", checkpoint.href);
    await expect(demoReadinessList.getByText(checkpoint.signal, { exact: true })).toBeVisible();
    await expect(demoReadinessList.getByText(checkpoint.boundary)).toBeVisible();
  }
  for (const link of demoOperationsLinks) {
    await expect(page.getByRole("link", { name: link.label }).first()).toHaveAttribute("href", link.href);
    await expect(page.getByText(link.note, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "Demo Console" }).click();
  await expect(page.getByRole("heading", { name: "SignalStack Demo Console" })).toBeVisible();
  await page.getByRole("link", { name: "Operations Index" }).click();
  await expect(page.getByRole("heading", { name: "Operations Index" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Demo And Workflow" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Data And Messaging" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Safety And Runtime" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Provider And Reporting" })).toBeVisible();
  for (const link of operationSurfaceLinks) {
    await expect(page.getByRole("link", { name: link.label }).first()).toBeVisible();
    await expect(page.getByText(link.href, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "Demo Operations" }).first().click();
  await expect(page.getByRole("heading", { name: "Demo Operations" })).toBeVisible();
  await page.getByRole("link", { name: "Demo Console" }).click();
  await expect(page.getByRole("heading", { name: "SignalStack Demo Console" })).toBeVisible();
  await page.getByRole("link", { name: "System Status" }).click();
  await expect(page.getByRole("heading", { name: "System Status" })).toBeVisible();
  await expect(page.getByText("Safety Defaults")).toBeVisible();
  await expect(page.getByText("Runtime")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Queue" })).toBeVisible();
  await expect(page.getByText("API Protection")).toBeVisible();
  await page.getByRole("link", { name: "Environment Operations" }).click();
  await expect(page.getByRole("heading", { name: "Environment Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Demo-Safe Defaults" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Configuration Categories" })).toBeVisible();
  await expect(page.getByText("External-impact gates")).toBeVisible();
  for (const link of environmentOperationLinks) {
    await expect(page.getByRole("link", { name: link.label }).first()).toHaveAttribute("href", link.href);
    await expect(page.getByText(link.note, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "Health Operations" }).first().click();
  await expect(page.getByRole("heading", { name: "Health Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Health Signals" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Demo-Safe Defaults" })).toBeVisible();
  await expect(page.getByText("GET /api/health")).toBeVisible();
  for (const link of healthOperationLinks) {
    await expect(page.getByRole("link", { name: link.label }).first()).toHaveAttribute("href", link.href);
    await expect(page.getByText(link.note, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "API Operations" }).first().click();
  await expect(page.getByRole("heading", { name: "API Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Route Inventory" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rate Limit Policy" })).toBeVisible();
  await expect(page.getByText("External impact routes", { exact: true })).toBeVisible();
  await expect(page.getByText("/api/webhooks/twilio/inbound")).toBeVisible();
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "Contract Operations" }).click();
  await expect(page.getByRole("heading", { name: "Contract Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Contract Inventory" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Validation Commands" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Drift Controls" })).toBeVisible();
  await expect(page.getByText("contracts/CONTRACT-API.md")).toBeVisible();
  for (const link of contractOperationLinks) {
    await expect(page.getByRole("link", { name: link.label }).first()).toHaveAttribute("href", link.href);
  }
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "Validation Operations" }).click();
  await expect(page.getByRole("heading", { name: "Validation Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gate Inventory" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Repair Signals" })).toBeVisible();
  await expect(page.getByText("npm run validate")).toBeVisible();
  for (const link of validationOperationLinks) {
    await expect(page.getByRole("link", { name: link.label }).first()).toHaveAttribute("href", link.href);
  }
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "Contract Operations" }).click();
  await expect(page.getByRole("heading", { name: "Contract Operations" })).toBeVisible();
  await page.getByRole("link", { name: "API Operations" }).click();
  await expect(page.getByRole("heading", { name: "API Operations" })).toBeVisible();
  await page.getByRole("link", { name: "Security Operations" }).click();
  await expect(page.getByRole("heading", { name: "Security Operations" })).toBeVisible();
  for (const link of securityOperationLinks) {
    await expect(page.getByRole("link", { name: link.label }).first()).toHaveAttribute("href", link.href);
  }
  await expect(page.getByRole("heading", { name: "Safety Gates" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Runtime Controls" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Control Inventory" })).toBeVisible();
  await expect(page.getByText("Secret scanning remains")).toBeVisible();
  await page.getByRole("link", { name: "Notification Operations" }).click();
  await expect(page.getByRole("heading", { name: "Notification Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Channel Boundaries" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No-Send Controls" })).toBeVisible();
  for (const link of notificationOperationLinks) {
    await expect(page.getByRole("link", { name: link.label }).first()).toHaveAttribute("href", link.href);
  }
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "Integration Operations" }).click();
  await expect(page.getByRole("heading", { name: "Integration Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Integration Surfaces" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Runtime Gates" })).toBeVisible();
  await expect(page.getByText("dummy-first")).toBeVisible();
  for (const area of integrationOperationAreas) {
    await expect(page.getByRole("link", { name: area.label }).first()).toHaveAttribute("href", area.href);
    await expect(page.getByText(area.state, { exact: true })).toBeVisible();
    await expect(page.getByText(area.boundary)).toBeVisible();
  }
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "Workflow Operations" }).first().click();
  await expect(page.getByRole("heading", { name: "Workflow Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workflow Checkpoints" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Runtime Boundary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Audience Signal" })).toBeVisible();
  const workflowCheckpointList = page.locator("ol");
  for (const step of workflowOperationSteps) {
    await expect(page.getByRole("link", { name: step.name })).toHaveAttribute("href", step.href);
    await expect(workflowCheckpointList.getByText(step.owner, { exact: true })).toBeVisible();
    await expect(page.getByText(step.boundary)).toBeVisible();
  }
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "Release Operations" }).click();
  await expect(page.getByRole("heading", { name: "Release Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Release Checklist" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Runtime Boundary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Release Surfaces" })).toBeVisible();
  await expect(page.getByText("npm run premerge")).toBeVisible();
  for (const link of releaseOperationSurfaceLinks) {
    await expect(page.getByRole("link", { name: link.label }).first()).toHaveAttribute("href", link.href);
    await expect(page.getByText(link.note, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "Workflow Operations" }).first().click();
  await expect(page.getByRole("heading", { name: "Workflow Operations" })).toBeVisible();
  await page.getByRole("link", { name: "Integration Operations" }).click();
  await expect(page.getByRole("heading", { name: "Integration Operations" })).toBeVisible();
  await page.getByRole("link", { name: "Security Operations" }).click();
  await expect(page.getByRole("heading", { name: "Security Operations" })).toBeVisible();
  await page.getByRole("link", { name: "Operator Runbook" }).click();
  await expect(page.getByRole("heading", { name: "Operator Runbook" })).toBeVisible();
  await expect(page.getByText("Daily Local Start")).toBeVisible();
  await expect(page.getByText("Repair Loop")).toBeVisible();
  await expect(page.getByText("Command execution")).toBeVisible();
  await expect(page.getByRole("link", { name: "Queue Operations" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Health Operations" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Delivery Operations" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Readiness Audit" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Provider Numbers" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Integration Operations" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Workflow Operations" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Release Operations" }).first()).toBeVisible();
  await page.getByRole("link", { name: "Usage & Analytics" }).first().click();
  await expect(page.getByRole("heading", { name: "Usage & Analytics" })).toBeVisible();
  await expect(page.getByText("Local Usage Totals")).toBeVisible();
  await expect(page.getByText("Billing Boundary")).toBeVisible();
  await expect(page.getByText("Recent Usage Events")).toBeVisible();
  await page.getByRole("link", { name: "Billing Operations" }).click();
  await expect(page.getByRole("heading", { name: "Billing Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Billing Account" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Local Usage Totals" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent Usage Events" })).toBeVisible();
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "Reporting Index" }).click();
  await expect(page.getByRole("heading", { name: "Reporting Index" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Report Surfaces" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Operational Snapshot" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent Readiness Signals" })).toBeVisible();
  for (const link of reportingIndexLinks) {
    await expect(page.getByRole("link", { name: link.label }).first()).toHaveAttribute("href", link.href);
    await expect(page.getByText(link.note, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "Usage & Analytics" }).first().click();
  await expect(page.getByRole("heading", { name: "Usage & Analytics" })).toBeVisible();
  await page.getByRole("link", { name: "AI Operations" }).click();
  await expect(page.getByRole("heading", { name: "AI Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Provider Boundary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Available AI Endpoints" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent AI Usage" })).toBeVisible();
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "Usage & Analytics" }).click();
  await page.getByRole("link", { name: "Campaign Operations" }).click();
  await expect(page.getByRole("heading", { name: "Campaign Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Campaign Status" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Queue Status" })).toBeVisible();
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "Queue Operations" }).click();
  await expect(page.getByRole("heading", { name: "Queue Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Queue Status" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Worker Boundary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Scheduled Timing" })).toBeVisible();
  for (const link of queueOperationLinks) {
    await expect(page.getByRole("link", { name: link.label }).first()).toHaveAttribute("href", link.href);
  }
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "Campaign Operations" }).click();
  await page.getByRole("link", { name: "Contact Operations" }).click();
  await expect(page.getByRole("heading", { name: "Contact Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Consent Status" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Import Status" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent Contacts" })).toBeVisible();
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "Data Operations" }).click();
  await expect(page.getByRole("heading", { name: "Data Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Soft Archive" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Import Ledger" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Retention Signals" })).toBeVisible();
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "Contact Operations" }).click();
  await page.getByRole("link", { name: "Audience Operations" }).click();
  await expect(page.getByRole("heading", { name: "Audience Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tags" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lists" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved Segments" })).toBeVisible();
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "Template Operations" }).click();
  await expect(page.getByRole("heading", { name: "Template Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Variable Coverage" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent Templates" })).toBeVisible();
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "Inbox Operations" }).click();
  await expect(page.getByRole("heading", { name: "Inbox Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Conversation Status" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent Conversations" })).toBeVisible();
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "Webhook Operations" }).click();
  await expect(page.getByRole("heading", { name: "Webhook Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Route Coverage" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Event Types" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent Webhook Events" })).toBeVisible();
  for (const link of webhookOperationLinks) {
    await expect(page.getByRole("link", { name: link.label }).first()).toHaveAttribute("href", link.href);
  }
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "Delivery Operations" }).click();
  await expect(page.getByRole("heading", { name: "Delivery Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Direction Status" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Delivery Status" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent Messages" })).toBeVisible();
  for (const link of deliveryOperationLinks) {
    await expect(page.getByRole("link", { name: link.label }).first()).toHaveAttribute("href", link.href);
  }
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "Inbox Operations" }).click();
  await page.getByRole("link", { name: "Team Operations" }).click();
  await expect(page.getByRole("heading", { name: "Team Operations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Organization" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Membership Status" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Team Members" })).toBeVisible();
  for (const link of teamOperationLinks) {
    await expect(page.getByRole("link", { name: link.label }).first()).toHaveAttribute("href", link.href);
  }
  await expect(page.getByText("Safety Boundary")).toBeVisible();
  await page.getByRole("link", { name: "Go-Live Readiness" }).click();
  await expect(page.getByRole("heading", { name: "Go-Live Readiness" })).toBeVisible();
  for (const link of settingsNavigationLinks) {
    await expect(page.getByRole("link", { name: link.label }).first()).toHaveAttribute("href", link.href);
  }
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
  for (const link of exportOperationLinks) {
    await expect(page.getByRole("link", { name: link.label }).first()).toHaveAttribute("href", link.href);
    await expect(page.getByText(link.note, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Export CSV" })).toHaveCount(2);
  await page.getByRole("link", { name: "Review Events" }).click();
  await expect(page.getByRole("heading", { name: "Readiness Audit" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Action Filters" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Subject Filters" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Audit Events" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Export Audit CSV" })).toBeVisible();
  await page.getByRole("link", { name: "COMPLIANCE_PROFILE_UPDATED" }).click();
  await expect(page.getByText("Action filter", { exact: true })).toBeVisible();
  const filteredReadinessAuditExportResponse = await request.get("/api/settings/readiness-audit/export?action=COMPLIANCE_PROFILE_UPDATED&limit=5");
  expect(filteredReadinessAuditExportResponse.ok()).toBeTruthy();
  await expect(filteredReadinessAuditExportResponse.text()).resolves.toContain("id,action,subjectType,subjectId,actorUserId,createdAt,metadata");
  await page.getByRole("link", { name: "Go-Live Readiness" }).click();
  const readinessAuditExportResponse = await request.get("/api/settings/readiness-audit/export?limit=5");
  expect(readinessAuditExportResponse.ok()).toBeTruthy();
  await expect(readinessAuditExportResponse.text()).resolves.toContain("id,action,subjectType,subjectId,actorUserId,createdAt,metadata");
  await page.getByRole("link", { name: "Provider Details" }).first().click();
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
