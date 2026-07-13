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

  it("does not substitute inherited object properties into the message", () => {
    // {{constructor}} / {{toString}} match the grammar but resolve to Object.prototype members; they
    // must render blank, never leak JS-engine internals into a sent SMS.
    expect(renderTemplate("A {{constructor}} B {{toString}} C {{__proto__}} D", { firstName: "Ada" })).toBe(
      "A  B  C  D"
    );
    // An explicitly provided own property with that name is still honored.
    expect(renderTemplate("Hi {{constructor}}", { constructor: "Bob" })).toBe("Hi Bob");
  });

  it("treats malformed placeholders as literal text and does not extract them", () => {
    // Hyphens and dots are not valid variable names (they can never be supplied through the validated
    // preview API), so every path leaves them as literal text rather than blanking them at send time.
    expect(extractTemplateVariables("Hi {{first-name}} {{a.b}}")).toEqual([]);
    expect(renderTemplate("Hi {{first-name}}", { "first-name": "Ada" })).toBe("Hi {{first-name}}");
  });
});
