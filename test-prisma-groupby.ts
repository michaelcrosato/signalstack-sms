import { prisma } from "./lib/db/prisma.js";

async function main() {
  const result = await prisma.contact.groupBy({
    by: ["consentStatus"],
    _count: true
  });
  console.log(result);
}
main();
