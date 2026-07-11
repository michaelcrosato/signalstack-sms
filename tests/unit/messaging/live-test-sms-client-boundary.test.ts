import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const formSource = readFileSync(join(process.cwd(), "app", "demo", "live-test-sms-form.tsx"), "utf8");

describe("live-test SMS client boundary", () => {
  it("does not ship the server confirmation phrase or full-number readiness props", () => {
    expect(formSource).not.toContain("live-test-sms-constants");
    expect(formSource).not.toContain("SEND LIVE TEST");
    expect(formSource).not.toContain("allowedRecipients:");
    expect(formSource).not.toContain("fromNumber:");
    expect(formSource).toContain("allowedRecipientLast4");
    expect(formSource).toContain("fromNumberLast4");
  });

  it("keeps operator controls ephemeral while preserving an ambiguous request ID during re-entry", () => {
    expect(formSource).toContain('const [operatorToken, setOperatorToken] = useState("")');
    expect(formSource).toContain('type="password"');
    expect(formSource).toContain('onChange={(event) => setOperatorToken(event.target.value)}');
    expect(formSource).toContain('onChange={(event) => setConfirmation(event.target.value)}');
    expect(formSource).not.toContain("beginNewRequest(() => setOperatorToken");
    expect(formSource).not.toContain("beginNewRequest(() => setConfirmation");
    expect(formSource).toContain('status: "pending"');
    expect(formSource).toContain("Start a deliberate new request");
  });
});
