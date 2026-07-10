import re

with open("tests/unit/compliance/gates.test.ts", "r") as f:
    content = f.read()

cleaned = re.sub(
    r'// will be overriden by contact\.state if it existed, but it doesn\'t\. Wait, the code says:\s*// if \(input\.contact\?\.state\) { resolvedState = input\.contact\.state; }\s*// So let\'s provide a state in quietHours, and NO state in contact\.',
    '// Provide state in quietHours but NO state in contact to test the fallback.',
    content
)

with open("tests/unit/compliance/gates.test.ts", "w") as f:
    f.write(cleaned)

print("Cleaned")
