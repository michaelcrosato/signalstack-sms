import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";

describe.runIf(process.env.RUN_DB_TESTS === "true")("provider-number default database invariant", () => {
  const slug = `provider-default-${Date.now()}`;
  let orgId: string | undefined;

  afterAll(async () => {
    if (orgId) {
      await prisma.organization.delete({ where: { id: orgId } });
    }
  });

  it("allows at most one default provider number per organization", async () => {
    const org = await prisma.organization.create({ data: { name: "Provider Default Test", slug } });
    orgId = org.id;

    await prisma.providerPhoneNumber.create({
      data: {
        orgId,
        phoneNumber: "+15555550101",
        capabilities: ["sms"],
        isDefault: true
      }
    });

    await expect(
      prisma.providerPhoneNumber.create({
        data: {
          orgId,
          phoneNumber: "+15555550102",
          capabilities: ["sms"],
          isDefault: true
        }
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
