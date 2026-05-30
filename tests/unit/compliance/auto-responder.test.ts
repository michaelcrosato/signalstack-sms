import { ConsentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { classifyInboundKeyword } from "@/lib/compliance/opt-out";
import { createDemoInboundMessage } from "@/lib/db/repositories/inbox";
import { prisma } from "@/lib/db/prisma";

describe("TCPA Opt-Out and Inbound Keyword Auto-Responder Seam", () => {
  it("classifies expanded opt-out keywords like REVOKE and OPTOUT", () => {
    expect(classifyInboundKeyword("REVOKE")).toBe("OPT_OUT");
    expect(classifyInboundKeyword("OPTOUT")).toBe("OPT_OUT");
    expect(classifyInboundKeyword("stop")).toBe("OPT_OUT");
  });

  it("classifies opt-in keywords like YES, JOIN, START", () => {
    expect(classifyInboundKeyword("YES")).toBe("OPT_IN");
    expect(classifyInboundKeyword("JOIN")).toBe("OPT_IN");
    expect(classifyInboundKeyword("START")).toBe("OPT_IN");
  });

  it("automatically transitions contact to OPTED_OUT and sends a compliant auto-response on opt-out keyword", async () => {
    const org = await prisma.organization.create({
      data: { slug: `org-opt-out-${Date.now()}`, name: `Org OptOut-${Date.now()}`, demoMode: true }
    });

    const phone = `+1555020${Math.floor(1000 + Math.random() * 9000)}`;

    // Create a contact
    const contact = await prisma.contact.create({
      data: {
        orgId: org.id,
        phone,
        consentStatus: ConsentStatus.OPTED_IN,
        consentCapturedAt: new Date(),
        consentMethod: "web_form",
        consentDisclosure: "I consent."
      }
    });

    // Inbound STOP message
    await createDemoInboundMessage(org.id, {
      phone,
      body: "STOP",
      providerMessageId: `msg_${Date.now()}`
    });

    // Verify contact status is updated to OPTED_OUT
    const updatedContact = await prisma.contact.findUniqueOrThrow({
      where: { id: contact.id }
    });
    expect(updatedContact.consentStatus).toBe(ConsentStatus.OPTED_OUT);
    expect(updatedContact.optedOutAt).not.toBeNull();

    // Verify that an outbound confirmation SMS was sent/saved
    const messages = await prisma.message.findMany({
      where: { contactId: contact.id, direction: "OUTBOUND" }
    });
    expect(messages.length).toBe(1);
    expect(messages[0].body).toContain("You have successfully opted out");
  });

  it("automatically transitions contact to OPTED_IN and sends confirmation when they send opt-in keyword", async () => {
    const org = await prisma.organization.create({
      data: { slug: `org-opt-in-${Date.now()}`, name: `Org OptIn-${Date.now()}`, demoMode: true }
    });

    const phone = `+1555030${Math.floor(1000 + Math.random() * 9000)}`;

    // Create a contact with PENDING_DOUBLE_OPT_IN
    const contact = await prisma.contact.create({
      data: {
        orgId: org.id,
        phone,
        consentStatus: ConsentStatus.PENDING_DOUBLE_OPT_IN
      }
    });

    // Inbound YES message
    await createDemoInboundMessage(org.id, {
      phone,
      body: "YES",
      providerMessageId: `msg_${Date.now()}`
    });

    // Verify contact status is updated to OPTED_IN and has consent evidence
    const updatedContact = await prisma.contact.findUniqueOrThrow({
      where: { id: contact.id }
    });
    expect(updatedContact.consentStatus).toBe(ConsentStatus.OPTED_IN);
    expect(updatedContact.consentCapturedAt).not.toBeNull();
    expect(updatedContact.consentMethod).toBe("SMS");
    expect(updatedContact.consentDisclosure).toContain("Contact replied with opt-in keyword");

    // Verify confirmation message was logged
    const messages = await prisma.message.findMany({
      where: { contactId: contact.id, direction: "OUTBOUND" }
    });
    expect(messages.length).toBe(1);
    expect(messages[0].body).toContain("successfully confirmed your subscription");
  });
});
