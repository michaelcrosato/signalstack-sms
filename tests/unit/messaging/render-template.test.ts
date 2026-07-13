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

  it("renders placeholders with surrounding whitespace", () => {
    expect(renderTemplate("Hi {{ firstName }}!", { firstName: "Ada" })).toBe("Hi Ada!");
  });

  it("treats malformed placeholders as literal text and does not extract them", () => {
    // Hyphens and dots are not valid variable names (they can never be supplied through the validated
    // preview API), so every path leaves them as literal text rather than blanking them at send time.
    expect(extractTemplateVariables("Hi {{first-name}} {{a.b}}")).toEqual([]);
    expect(renderTemplate("Hi {{first-name}}", { "first-name": "Ada" })).toBe("Hi {{first-name}}");
  });
});
