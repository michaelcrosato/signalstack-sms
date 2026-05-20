import { processDueScheduledCampaignJobs } from "@/lib/queue/worker";

process.env.DEMO_MODE ??= "true";
process.env.LIVE_MESSAGING_ENABLED ??= "false";
process.env.MESSAGING_PROVIDER ??= "dummy";
process.env.DATABASE_URL ??= "postgresql://signalstack:signalstack@localhost:5432/signalstack_sms?schema=public";

async function main() {
  const result = await processDueScheduledCampaignJobs();

  if (result.blocked) {
    console.log("SignalStack SMS worker blocked: only dummy provider with live messaging disabled is supported.");
  } else {
    console.log(
      `SignalStack SMS worker processed ${result.processed} scheduled campaign job(s), skipped ${result.skipped}.`
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
