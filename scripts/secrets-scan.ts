import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

const files = globSync("**/*", {
  exclude: ["node_modules/**", ".git/**", ".next/**", "package-lock.json"]
}).filter((file) => !file.endsWith("/") && !file.includes("\\node_modules\\"));

const suspiciousPatterns = [
  /TWILIO_AUTH_TOKEN=['"][A-Za-z0-9_-]{20,}['"]/,
  /STRIPE_SECRET_KEY=['"]sk_(live|test)_[A-Za-z0-9]{20,}['"]/,
  /CLERK_SECRET_KEY=['"]sk_(live|test)_[A-Za-z0-9]{20,}['"]/
];

for (const file of files) {
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(text)) {
      console.error(`Potential committed secret in ${file}`);
      process.exit(1);
    }
  }
}

console.log("No committed secrets detected by bootstrap scan.");
