with open("tests/unit/db/repositories/inbox.test.ts", "r") as f:
    content = f.read()

# Replace `(callback: any)`
content = content.replace("(callback: any)", "(callback: Parameters<typeof prisma.$transaction>[0])")

# Replace `(result as any)`
content = content.replace("(result as any)?.reasons", "result?.reasons")
content = content.replace("(result as any)?.message", "result?.message")

with open("tests/unit/db/repositories/inbox.test.ts", "w") as f:
    f.write(content)
