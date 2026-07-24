import { createHmac } from "node:crypto";
import { ConsentStatus, MessageTransport, type Contact } from "@prisma/client";
import { describe, expect, it, beforeEach } from "vitest";
import { POST as inboundWebhookRoute } from "@/app/api/webhooks/twilio/inbound/route";
import { classifyInboundKeyword } from "@/lib/compliance/opt-out";
import { prisma } from "@/lib/db/prisma";
import { createDemoInboundMessage } from "@/lib/db/repositories/inbox";
import { preflightCampaignRecipients } from "@/lib/messaging/send-preflight";
import { reserveDirectMessage } from "@/lib/messaging/direct-message-reservation";
import { validateTwilioSignature, normalizeTwilioInbound } from "@/lib/messaging/twilio-webhooks";
import { authenticateTwilioProviderCallback } from "@/lib/integrations/provider-accounts/webhook-routing";

function signTwilio(url: string, params: Record<string, string>, authToken: string): string {
  const base = Object.keys(params)
    .sort()
    .reduce((value, key) => `${value}${key}${params[key]}`, url);
  return createHmac("sha1", authToken).update(base).digest("base64");
}

describe("M6 Inbound Edge Case & Stress Testing (Empirical)", () => {
  beforeEach(() => {
    process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
    process.env.API_KEY_PEPPER = "test_api_key_pepper_string_32bytes!!";
  });

  describe("1. Malformed / Missing Twilio Signature Headers", () => {
    const url = "https://app.signalstack.test/api/webhooks/twilio/inbound";
    const authToken = "test_auth_token_secret_12345";
    const params = {
      AccountSid: "AC11111111111111111111111111111111",
      From: "+15555550100",
      To: "+15555550199",
      Body: "Hello",
      MessageSid: "SM9990001"
    };

    it("empirically verifies validateTwilioSignature returns false for missing signature", () => {
      const isValid = validateTwilioSignature({
        authToken,
        signature: undefined,
        url,
        params
      });
      expect(isValid).toBe(false);
    });

    it("empirically verifies validateTwilioSignature returns false for null signature", () => {
      const isValid = validateTwilioSignature({
        authToken,
        signature: null,
        url,
        params
      });
      expect(isValid).toBe(false);
    });

    it("empirically verifies validateTwilioSignature returns false for empty authToken", () => {
      const signature = signTwilio(url, params, authToken);
      const isValid = validateTwilioSignature({
        authToken: "",
        signature,
        url,
        params
      });
      expect(isValid).toBe(false);
    });

    it("empirically verifies validateTwilioSignature returns false for tampered/corrupted signature", () => {
      const signature = signTwilio(url, params, authToken);
      const tampered = signature.slice(0, -4) + "XXXX";
      const isValid = validateTwilioSignature({
        authToken,
        signature: tampered,
        url,
        params
      });
      expect(isValid).toBe(false);
    });

    it("empirically verifies validateTwilioSignature returns false for signature computed over different params", () => {
      const modifiedParams = { ...params, Body: "Tampered body content" };
      const signature = signTwilio(url, modifiedParams, authToken);
      const isValid = validateTwilioSignature({
        authToken,
        signature,
        url,
        params
      });
      expect(isValid).toBe(false);
    });

    it("empirically verifies validateTwilioSignature returns false for signature computed over different URL", () => {
      const signature = signTwilio("https://attacker.test/api/webhooks/twilio/inbound", params, authToken);
      const isValid = validateTwilioSignature({
        authToken,
        signature,
        url,
        params
      });
      expect(isValid).toBe(false);
    });

    it("empirically verifies inboundWebhookRoute rejects request with non-form content-type (400)", async () => {
      const request = new Request("http://localhost/api/webhooks/twilio/inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params)
      });
      const response = await inboundWebhookRoute(request);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Invalid Twilio form payload.");
    });
  });

  describe("2. Mixed-Case & Whitespace Opt-Out Keywords", () => {
    const optOutTestCases = [
      { input: "sToP", expected: "OPT_OUT" },
      { input: "  stop  ", expected: "OPT_OUT" },
      { input: "UNSUBSCRIBE", expected: "OPT_OUT" },
      { input: "  StOpAlL\n  ", expected: "OPT_OUT" },
      { input: "CANCEL", expected: "OPT_OUT" },
      { input: "cAnCeL", expected: "OPT_OUT" },
      { input: "END", expected: "OPT_OUT" },
      { input: "QUIT", expected: "OPT_OUT" },
      { input: "OPTOUT", expected: "OPT_OUT" },
      { input: "REVOKE", expected: "OPT_OUT" },
      { input: "stop please cancel me", expected: "OPT_OUT" },
      { input: "\t  unsubscribe \r\n", expected: "OPT_OUT" }
    ];

    optOutTestCases.forEach(({ input, expected }) => {
      it(`classifyInboundKeyword correctly classifies '${input.replace(/\n/g, "\\n")}' as ${expected}`, () => {
        const result = classifyInboundKeyword(input);
        expect(result).toBe(expected);
      });
    });

    const optInTestCases = [
      { input: "yEs", expected: "OPT_IN" },
      { input: "  START ", expected: "OPT_IN" },
      { input: "jOiN", expected: "OPT_IN" },
      { input: "UNSTOP", expected: "OPT_IN" },
      { input: "CONFIRM", expected: "OPT_IN" }
    ];

    optInTestCases.forEach(({ input, expected }) => {
      it(`classifyInboundKeyword correctly classifies opt-in keyword '${input}' as ${expected}`, () => {
        const result = classifyInboundKeyword(input);
        expect(result).toBe(expected);
      });
    });

    it.runIf(process.env.RUN_DB_TESTS === "true")("empirically verifies database state transition on mixed-case opt-out 'sToP'", async () => {
      const org = await prisma.organization.create({
        data: { slug: `org-stop-test-${Date.now()}`, name: `Org Stop Test-${Date.now()}` }
      });
      const phone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;

      const contact = await prisma.contact.create({
        data: {
          orgId: org.id,
          phone,
          consentStatus: ConsentStatus.OPTED_IN,
          consentCapturedAt: new Date(),
          consentMethod: "web",
          consentDisclosure: "I agree to receiving SMS updates."
        }
      });

      const res = await createDemoInboundMessage(org.id, {
        phone,
        body: "   sToP   ",
        providerMessageId: `msg_mixed_case_${Date.now()}`
      });

      expect(res.keywordAction).toBe("OPT_OUT");

      const updatedContact = await prisma.contact.findUniqueOrThrow({
        where: { id: contact.id }
      });
      expect(updatedContact.consentStatus).toBe(ConsentStatus.OPTED_OUT);
      expect(updatedContact.optedOutAt).not.toBeNull();
    });
  });

  describe("3. Duplicate Inbound Webhooks & Idempotency Handling", () => {
    it.runIf(process.env.RUN_DB_TESTS === "true")("empirically verifies createDemoInboundMessage is strictly idempotent", async () => {
      const org = await prisma.organization.create({
        data: { slug: `org-dedup-${Date.now()}`, name: `Org Dedup-${Date.now()}` }
      });
      const phone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;
      const providerMessageId = `msg_dedup_${Date.now()}`;

      // First processing attempt
      const result1 = await createDemoInboundMessage(org.id, {
        phone,
        body: "Hello World Initial",
        providerMessageId
      });

      const message1Id = result1.message.id;

      // Duplicate processing attempt with same providerMessageId
      const result2 = await createDemoInboundMessage(org.id, {
        phone,
        body: "Hello World Duplicate",
        providerMessageId
      });

      expect(result2.message.id).toBe(message1Id);

      // Confirm only ONE message exists in DB with this idempotency key
      const count = await prisma.message.count({
        where: {
          orgId: org.id,
          idempotencyKey: `demo-inbound:${org.id}:${providerMessageId}`
        }
      });
      expect(count).toBe(1);

      // Confirm only ONE conversation was created for this contact
      const conversationCount = await prisma.conversation.count({
        where: { orgId: org.id, contactId: result1.conversation?.contactId }
      });
      expect(conversationCount).toBe(1);
    });

    it("empirically verifies normalizeTwilioInbound generates deterministic idempotency key based on MessageSid", () => {
      const payload1 = { MessageSid: "SM123456789", From: "+15555550100", Body: "Test 1" };
      const payload2 = { MessageSid: "SM123456789", From: "+15555550100", Body: "Test 2" };

      const norm1 = normalizeTwilioInbound(payload1);
      const norm2 = normalizeTwilioInbound(payload2);

      expect(norm1?.idempotencyKey).toBe("twilio:inbound:SM123456789");
      expect(norm2?.idempotencyKey).toBe("twilio:inbound:SM123456789");
      expect(norm1?.idempotencyKey).toBe(norm2?.idempotencyKey);
    });
  });

  describe("4. Unknown Destination Numbers & Tenant Spoofing Prevention", () => {
    it.runIf(process.env.RUN_DB_TESTS === "true")("empirically verifies authenticateTwilioProviderCallback rejects invalid / unformatted destination numbers", async () => {
      await expect(
        authenticateTwilioProviderCallback({
          kind: "inbound",
          url: "https://app.signalstack.test/api/webhooks/twilio/inbound",
          signature: "any_sig",
          params: {
            AccountSid: "AC00000000000000000000000000000000",
            To: "invalid_phone_format",
            From: "+15555550100",
            MessageSid: "SM100"
          }
        })
      ).rejects.toThrow("Provider callback rejected.");
    });

    it.runIf(process.env.RUN_DB_TESTS === "true")("empirically verifies authenticateTwilioProviderCallback rejects unknown destination numbers not bound in DB", async () => {
      await expect(
        authenticateTwilioProviderCallback({
          kind: "inbound",
          url: "https://app.signalstack.test/api/webhooks/twilio/inbound",
          signature: "any_sig",
          params: {
            AccountSid: "AC00000000000000000000000000000000",
            To: "+15559998877", // non-existent number
            From: "+15555550100",
            MessageSid: "SM101"
          }
        })
      ).rejects.toThrow("Provider callback rejected.");
    });
  });

  describe("5. Opt-Out Suppression Enforcement on Subsequent Outbound Attempts", () => {
    it.runIf(process.env.RUN_DB_TESTS === "true")("empirically verifies reserveDirectMessage BLOCKS outbound send attempts to opted-out contacts", async () => {
      const org = await prisma.organization.create({
        data: { slug: `org-suppress-${Date.now()}`, name: `Org Suppress-${Date.now()}` }
      });
      const phone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;

      // Create contact and opt them out via inbound SMS
      const contact = await prisma.contact.create({
        data: {
          orgId: org.id,
          phone,
          consentStatus: ConsentStatus.OPTED_IN,
          consentCapturedAt: new Date(),
          consentMethod: "web",
          consentDisclosure: "I agree to receive messages."
        }
      });

      // Send inbound STOP
      await createDemoInboundMessage(org.id, {
        phone,
        body: "STOP",
        providerMessageId: `msg_stop_${Date.now()}`
      });

      // Verify contact consent is OPTED_OUT
      const refreshedContact = await prisma.contact.findUniqueOrThrow({
        where: { id: contact.id }
      });
      expect(refreshedContact.consentStatus).toBe(ConsentStatus.OPTED_OUT);

      // Attempt to reserve direct message outbound to this opted-out contact
      const outboundResult = await prisma.$transaction(async (tx) => {
        return reserveDirectMessage(tx, {
          orgId: org.id,
          route: "public_direct",
          identity: {
            kind: "browser_inbox",
            requestId: "11111111-2222-4333-8444-555555555555"
          },
          transport: MessageTransport.DUMMY,
          contactId: contact.id,
          body: "Hello, this is a promotional offer!"
        });
      });

      expect(outboundResult.ok).toBe(false);
      if (!outboundResult.ok) {
        expect(outboundResult.kind).toBe("blocked");
        if (outboundResult.kind === "blocked") {
          expect(outboundResult.reasons).toContain("CONTACT_OPTED_OUT");
        }
      }
    });

    it("empirically verifies preflightCampaignRecipients BLOCKS opted-out contacts from campaign distribution", async () => {
      const phoneOptedIn = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;
      const phoneOptedOut = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;

      type PreflightContact = Pick<Contact, "id" | "phone" | "consentStatus" | "optedOutAt" | "archivedAt">;

      const contact1: PreflightContact = {
        id: "c1",
        phone: phoneOptedIn,
        consentStatus: ConsentStatus.OPTED_IN,
        optedOutAt: null,
        archivedAt: null
      };

      const contact2: PreflightContact = {
        id: "c2",
        phone: phoneOptedOut,
        consentStatus: ConsentStatus.OPTED_OUT,
        optedOutAt: new Date(),
        archivedAt: null
      };

      const preflight = preflightCampaignRecipients([contact1, contact2]);

      expect(preflight.allowed).toBe(false);
      expect(preflight.totalRecipients).toBe(2);
      expect(preflight.allowedRecipients).toBe(1);
      expect(preflight.blockedRecipients).toBe(1);

      const blockedRecipient = preflight.recipients.find((r) => r.contactId === "c2");
      expect(blockedRecipient?.allowed).toBe(false);
      expect(blockedRecipient?.reasons).toContain("CONTACT_OPTED_OUT");
    });
  });
});
