import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";

describe.runIf(process.env.RUN_DB_TESTS === "true")("contact consent evidence database invariant", () => {
  const slug = `consent-evidence-${Date.now()}`;
  let orgId: string | undefined;

  afterAll(async () => {
    if (orgId) {
      await prisma.organization.delete({ where: { id: orgId } });
    }
  });

  it("allows one complete capture but rejects partial, later, clearing, and concurrent replacement", async () => {
    const org = await prisma.organization.create({
      data: { name: "Consent Evidence Constraint", slug }
    });
    orgId = org.id;

    const contact = await prisma.contact.create({
      data: { orgId, phone: "+15555550191" }
    });
    const capturedAt = new Date("2026-07-10T12:00:00.000Z");

    await expect(
      prisma.contact.update({
        where: { id: contact.id },
        data: { consentMethod: "web_form" }
      })
    ).rejects.toBeDefined();

    await prisma.contact.update({
      where: { id: contact.id },
      data: {
        consentCapturedAt: capturedAt,
        consentMethod: "web_form",
        consentDisclosure: "I agree to receive messages."
      }
    });

    await expect(
      prisma.contact.update({
        where: { id: contact.id },
        data: { consentMethod: "sms_keyword" }
      })
    ).rejects.toBeDefined();
    await expect(
      prisma.contact.update({
        where: { id: contact.id },
        data: { consentDisclosure: null }
      })
    ).rejects.toBeDefined();

    await expect(
      prisma.contact.update({
        where: { id: contact.id },
        data: { firstName: "Ada", consentCapturedAt: capturedAt }
      })
    ).resolves.toMatchObject({ firstName: "Ada", consentMethod: "web_form" });

    const raceContact = await prisma.contact.create({
      data: { orgId, phone: "+15555550192" }
    });
    const results = await Promise.allSettled([
      prisma.contact.update({
        where: { id: raceContact.id },
        data: {
          consentCapturedAt: new Date("2026-07-10T13:00:00.000Z"),
          consentMethod: "web_form",
          consentDisclosure: "Web disclosure."
        }
      }),
      prisma.contact.update({
        where: { id: raceContact.id },
        data: {
          consentCapturedAt: new Date("2026-07-10T14:00:00.000Z"),
          consentMethod: "sms_keyword",
          consentDisclosure: "SMS disclosure."
        }
      })
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const saved = await prisma.contact.findUniqueOrThrow({ where: { id: raceContact.id } });
    expect([
      ["web_form", "Web disclosure."],
      ["sms_keyword", "SMS disclosure."]
    ]).toContainEqual([saved.consentMethod, saved.consentDisclosure]);
  });
});
