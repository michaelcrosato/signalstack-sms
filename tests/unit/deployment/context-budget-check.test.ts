import { describe, expect, it } from "vitest";
import { evaluateContextBudget, type BudgetedFile } from "@/scripts/context-budget-check";

describe("context budget check", () => {
  it("passes with no failures for the current workspace defaults", () => {
    const { failures } = evaluateContextBudget();
    expect(failures).toEqual([]);
  });

  it("handles optional files that do not exist without failing", () => {
    const mockBudgets: BudgetedFile[] = [
      {
        path: "non-existent-optional-file.md",
        maxBytes: 1000,
        isOptional: true
      }
    ];

    const { failures } = evaluateContextBudget(mockBudgets, []);
    expect(failures).toEqual([]);
  });

  it("fails when a non-optional budget file does not exist", () => {
    const mockBudgets: BudgetedFile[] = [
      {
        path: "non-existent-required-file.md",
        maxBytes: 1000,
        isOptional: false
      }
    ];

    const { failures } = evaluateContextBudget(mockBudgets, []);
    expect(failures).toContain("non-existent-required-file.md does not exist and is a required budget file.");
  });

  it("fails when a file exceeds its byte budget limit", () => {
    const mockBudgets: BudgetedFile[] = [
      {
        path: "SUMMARY.codex.md",
        maxBytes: 1, // extremely low to trigger failure
        isOptional: false
      }
    ];

    const { failures } = evaluateContextBudget(mockBudgets, []);
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0]).toContain("above the 1 byte current-handoff budget");
  });

  it("fails when required text is missing", () => {
    const mockBudgets: BudgetedFile[] = [
      {
        path: "SUMMARY.codex.md",
        maxBytes: 10000,
        requiredText: ["THIS_WILL_NEVER_EXIST_IN_THE_FILE_XYZ"]
      }
    ];

    const { failures } = evaluateContextBudget(mockBudgets, []);
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0]).toContain("is missing required context-budget text: THIS_WILL_NEVER_EXIST_IN_THE_FILE_XYZ");
  });

  it("fails when forbidden text is present", () => {
    const mockBudgets: BudgetedFile[] = [
      {
        path: "SUMMARY.codex.md",
        maxBytes: 10000,
        forbiddenText: ["Run number:"] // SUMMARY.codex.md has "Run number:"
      }
    ];

    const { failures } = evaluateContextBudget(mockBudgets, []);
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0]).toContain("contains historical handoff bloat marker: Run number:");
  });
});
