import { ConsentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  serializePublicContact,
  serializePublicList,
  serializePublicOrganization,
  serializePublicSegment,
  serializePublicTag,
  serializePublicTemplate
} from "@/lib/public-api/resource-dtos";

const createdAt = new Date("2026-07-10T01:02:03.000Z");
const updatedAt = new Date("2026-07-10T02:03:04.000Z");

describe("public API resource DTOs", () => {
  it("serializes only allowlisted contact fields with stable label ordering", () => {
    const internalRow = {
      id: "contact_demo",
      orgId: "must-not-leak",
      phone: "+15555550100",
      email: null,
      firstName: "Ada",
      lastName: "Lovelace",
      displayName: "Ada",
      consentStatus: ConsentStatus.OPTED_IN,
      optInSource: "website",
      optInAt: createdAt,
      optedOutAt: null,
      consentCapturedAt: createdAt,
      consentMethod: "checkbox",
      consentDisclosure: "I agree",
      source: "api",
      notes: null,
      leadScore: 70,
      leadStage: "qualified",
      leadQualifiedAt: updatedAt,
      archivedAt: null,
      createdAt,
      updatedAt,
      tagLinks: [
        { tag: { id: "tag_z", name: "Zulu", color: null } },
        { tag: { id: "tag_a", name: "Alpha", color: "#112233" } }
      ],
      listLinks: [
        { list: { id: "list_z", name: "Zulu" } },
        { list: { id: "list_a", name: "Alpha" } }
      ],
      secretHash: "must-not-leak"
    };

    const dto = serializePublicContact(internalRow);
    expect(dto).not.toHaveProperty("orgId");
    expect(dto).not.toHaveProperty("secretHash");
    expect(dto.tags.map((tag) => tag.name)).toEqual(["Alpha", "Zulu"]);
    expect(dto.lists.map((list) => list.name)).toEqual(["Alpha", "Zulu"]);
    expect(dto.consentEvidence).toEqual({
      capturedAt: createdAt.toISOString(),
      method: "checkbox",
      disclosure: "I agree"
    });
    expect(dto.updatedAt).toBe(updatedAt.toISOString());
  });

  it("serializes each remaining public resource without tenant fields", () => {
    const organization = serializePublicOrganization({ id: "org", name: "Org", slug: "org", timezone: "UTC", createdAt, updatedAt });
    const tag = serializePublicTag({ id: "tag", name: "Tag", color: null, createdAt, updatedAt, _count: { contacts: 2 } });
    const list = serializePublicList({ id: "list", name: "List", description: null, createdAt, updatedAt, _count: { members: 3 } });
    const segment = serializePublicSegment({ id: "segment", name: "Segment", description: null, definition: { tagNames: ["Tag"] }, createdAt, updatedAt });
    const template = serializePublicTemplate({ id: "template", name: "Template", body: "Hello", variables: ["firstName"], createdAt, updatedAt, _count: { campaigns: 4 } });

    expect(organization).toMatchObject({ id: "org", timezone: "UTC" });
    expect(tag.contactCount).toBe(2);
    expect(list.memberCount).toBe(3);
    expect(segment.definition).toEqual({ tagNames: ["Tag"], consentStatuses: [] });
    expect(template).toMatchObject({ variables: ["firstName"], campaignCount: 4 });
    for (const dto of [organization, tag, list, segment, template]) {
      expect(dto).not.toHaveProperty("orgId");
    }
  });

  it("fails closed instead of exposing malformed stored JSON", () => {
    expect(() => serializePublicTemplate({ id: "template", name: "Template", body: "Hello", variables: { unsafe: true }, createdAt, updatedAt, _count: { campaigns: 0 } })).toThrow(TypeError);
    expect(() => serializePublicSegment({ id: "segment", name: "Segment", description: null, definition: { extra: "unsafe" }, createdAt, updatedAt })).toThrow();
  });
});
