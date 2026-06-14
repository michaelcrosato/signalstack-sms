import { describe, expect, it } from "vitest";
import { classifyInboundKeyword } from "@/lib/compliance/opt-out";

describe("inbound keyword classification", () => {
  it("classifies opt-out keywords from the first token", () => {
    expect(classifyInboundKeyword("STOP")).toBe("OPT_OUT");
    expect(classifyInboundKeyword(" unsubscribe please")).toBe("OPT_OUT");
    expect(classifyInboundKeyword("quit.")).toBe("OPT_OUT");
  });

  it("classifies HELP-class keywords without opting the contact in", () => {
    expect(classifyInboundKeyword("HELP")).toBe("HELP");
    expect(classifyInboundKeyword("help me")).toBe("HELP");
    expect(classifyInboundKeyword("INFO")).toBe("HELP");
    expect(classifyInboundKeyword("info please")).toBe("HELP");
  });

  it("ignores non-keyword replies", () => {
    expect(classifyInboundKeyword("Can you send pricing?")).toBe("NONE");
  });
});
