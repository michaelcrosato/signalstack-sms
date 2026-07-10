import re

with open("tests/unit/db/provider-credentials.test.ts", "r") as f:
    content = f.read()

# vitest hoists vi.mock, so vi.hoisted is required if we want to use external variables.
# Alternatively, inline it.
new_mock = """const mockPrismaClient = vi.hoisted(() => ({
  providerCredential: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
  providerCredentialRotation: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  liveReadinessAuditEvent: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    ...mockPrismaClient,
    $transaction: vi.fn(async (cb) => cb(mockPrismaClient)),
  },
}));"""

old_mock_pattern = r'const mockPrismaClient = \{[\s\S]*?vi\.mock\("@/lib/db/prisma", \(\) => \(\{[\s\S]*?\}\)\);'
content = re.sub(old_mock_pattern, new_mock, content)

with open("tests/unit/db/provider-credentials.test.ts", "w") as f:
    f.write(content)
