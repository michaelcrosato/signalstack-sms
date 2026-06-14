import { describe, expect, it } from "vitest";
import { extractTemplateVariables, renderTemplate } from "@/lib/messaging/render-template";

describe("template rendering", () => {
  it("extracts unique variables", () => {
    expect(extractTemplateVariables("Hi {{ firstName }}, reply {{keyword}}. {{ firstName }}")).toEqual([
      "firstName",
      "keyword"
    ]);
  });

  it("renders missing variables as empty strings", () => {
    expect(renderTemplate("Hi {{firstName}} {{lastName}}", { firstName: "Ada" })).toBe("Hi Ada ");
  });
});
