import { readFileSync } from "node:fs";

type RequiredText = {
  file: string;
  text: string;
};

const requiredTexts: RequiredText[] = [
  {
    file: "docs/PRODUCTION_WORKER_POLICY.md",
    text: "does not authorize production worker execution"
  },
  {
    file: "docs/PRODUCTION_WORKER_POLICY.md",
    text: "Production-like runtime markers are `NODE_ENV`, `VERCEL_ENV`, `DEPLOYMENT_ENV`, or `APP_ENV`"
  },
  {
    file: "docs/PRODUCTION_WORKER_POLICY.md",
    text: "Tests proving production-like worker startup remains blocked"
  },
  {
    file: "docs/PRODUCTION_WORKER_POLICY.md",
    text: "`WORKER_DEPLOYMENT_CLASS` may be unset or `local-demo` only"
  },
  {
    file: "docs/PRODUCTION_WORKER_POLICY.md",
    text: "The isolated `/demo` live-test SMS path remains separate from campaign workers"
  },
  {
    file: "docs/PRODUCTION_WORKER_POLICY.md",
    text: "The reserved future class name is `production-live-campaign`. It is a planning label only."
  },
  {
    file: "docs/PRODUCTION_WORKER_POLICY.md",
    text: "A provider mutation boundary that calls the centralized messaging hard gate immediately before every outbound provider request."
  },
  {
    file: "docs/PRODUCTION_WORKER_POLICY.md",
    text: "A rollback runbook that disables live campaign workers without code changes"
  },
  {
    file: "lib/queue/worker.ts",
    text: "reason: \"production-worker-blocked\""
  },
  {
    file: "lib/queue/worker.ts",
    text: "environmentIsProductionLike"
  },
  {
    file: "lib/queue/worker.ts",
    text: "supportedWorkerDeploymentClasses"
  },
  {
    file: "lib/queue/live-worker-controls.ts",
    text: "reservedLiveWorkerDeploymentClass = \"production-live-campaign\""
  },
  {
    file: "lib/queue/live-worker-controls.ts",
    text: "liveWorkerControlsAreImplemented"
  },
  {
    file: "lib/queue/live-worker-controls.ts",
    text: "liveWorkerControlIdsMatchRequiredChecklist"
  },
  {
    file: "lib/queue/live-worker-controls.ts",
    text: "liveWorkerControlsUseSupportedStatuses"
  },
  {
    file: "lib/queue/live-worker-controls.ts",
    text: "liveWorkerDeploymentClassIsAuthorized"
  },
  {
    file: "lib/queue/bullmq-worker.ts",
    text: "WORKER_DEPLOYMENT_CLASS"
  },
  {
    file: "tests/unit/queue/worker.test.ts",
    text: "blocks worker processing in production-like runtimes"
  },
  {
    file: "tests/unit/queue/worker.test.ts",
    text: "allows only the current local-demo worker deployment class"
  },
  {
    file: "tests/unit/queue/worker.test.ts",
    text: "production-live-campaign"
  },
  {
    file: "tests/unit/queue/live-worker-controls.test.ts",
    text: "authorizes the reserved production class only when every control is implemented"
  },
  {
    file: "tests/unit/queue/live-worker-controls.test.ts",
    text: "requires the exact frozen control checklist"
  },
  {
    file: "tests/unit/queue/live-worker-controls.test.ts",
    text: "keeps live-worker control statuses inside the exported vocabulary"
  },
  {
    file: "tests/unit/queue/bullmq-worker.test.ts",
    text: "WORKER_DEPLOYMENT_CLASS"
  },
  {
    file: "tests/unit/queue/bullmq-worker.test.ts",
    text: "production-live-campaign"
  },
  {
    file: "package.json",
    text: "\"worker\": \"tsx workers/index.ts\""
  },
  {
    file: "package.json",
    text: "\"worker:bullmq\": \"tsx workers/bullmq.ts\""
  }
];

const failures = requiredTexts.flatMap(({ file, text }) => {
  const contents = readFileSync(file, "utf8");
  return contents.includes(text) ? [] : [`${file} is missing required production worker policy text: ${text}`];
});

if (failures.length > 0) {
  console.error("Production worker policy check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Production worker policy check passed.");
