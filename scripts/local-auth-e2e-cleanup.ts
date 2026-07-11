import {
  cleanupLocalAuthE2eFixtures,
  disconnectLocalAuthE2eDatabase,
  requireLocalAuthE2eProfile
} from "@/e2e/local-auth-fixtures";

async function main() {
  const profile = requireLocalAuthE2eProfile();
  try {
    await cleanupLocalAuthE2eFixtures(profile.throttleSecret);
    console.info("Local-auth E2E fixtures cleaned.");
  } finally {
    await disconnectLocalAuthE2eDatabase();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Local-auth E2E cleanup failed.");
  process.exitCode = 1;
});
