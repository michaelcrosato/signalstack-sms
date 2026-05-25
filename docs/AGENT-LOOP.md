# COMMUNICATION DOCTRINE
Write for capable peers. Treat frontier agents as intelligent collaborators, not fragile
scripts. Give intent, constraints, resources, and standards. Do not micromanage internal steps.
Use human-level communication for reasoning. Use machine precision for scripts, schemas, tests,
contracts, APIs, and gates. Mission clarity beats procedural drag.
No word is the best word: remove any instruction that does not change behaviour.

# THE LOOP
LOOP UNTIL A HUMAN STOPS IT:

1. Explore.  Read the axioms first. Run `npm run agent:brief`, then reconcile repo truth:
   code, git state, tests, contracts, docs, roadmap, NEXT_PROMPTS, LOOP_LOG, prior
   artifacts, current failures, and outward information when it materially improves the next
   move.
2. Plan.     Read the axioms. Determine the move you would defend at human review. Roadmaps
   guide; repo truth governs. State the objective, the validation path, and the rollback point.
3. Work.     Read the axioms. Execute the most coherent, high-value change that advances the repo.
4. Validate. Read the axioms. Run the protected validation gate. Never weaken or bypass it.
5. Commit.   Read the axioms.
   - Green: commit to main, log the truth, continue.
   - Red but progress is real: repair and re-validate.
   - Progress stopped: save the attempt as an artifact, restore last green, re-validate the
     base, log the truth + pivot reason, choose different work, continue.

# CONTEXT BUDGET
Read the latest useful truth, not the entire history. Start with `npm run agent:brief`.
For append-only or oversized files
(`LOOP_LOG.md`, `docs/LOOP_LOG.md`, `SUMMARY.codex.md`, `BLOCKERS.codex.md`,
`docs/CURRENT_STATE_MATRIX.md`, large tests), start with current headers, latest entries,
`git diff`, and targeted `rg` queries. Load full historical files only when the current
task requires exact old context. If the next move is another syntactic variant of already
covered auth or worker hardening, first prove the gap is not already covered.

# EXHAUSTION RULE
Progress stops when the work no longer produces useful new information. No retry counters.
Signals: same failure repeats; error surface does not shrink; different approaches hit the same
blocker; next move is permutation churn; the agent cannot explain what the last attempt taught.

# FAILURE TAGS
Every preserved attempt is tagged EXHAUSTED or BLOCKED-ON-DEP.
- EXHAUSTED: out of useful hypotheses or a capability wall. Park until human input, a better
  model, or new information appears.
- BLOCKED-ON-DEP: approach is sound but waits on a missing prerequisite. Explore re-checks
  these; when the dependency lands, the work reactivates.

# ARTIFACT SHAPE
docs/loop-artifacts/run-XXX-YYYYMMDD-HHMM-slug-STATUS/
  attempt.patch
  notes.md      (required)
  failure.json  (optional)

notes.md template:
## Run XXX  <STATUS>  <slug>
Intent:   <one line>
Wall:     <what blocked it>
Tried:    <approaches>
Result:   <why it stopped  loss of delta>
Saved:    <path>
Next:     <do-not-retry-until / pivot>

# LOOP_LOG FORMAT
Append-only, no tables, one entry per run, readable in 60 seconds.
## Run XXX  <GREEN|BLOCKED-ON-DEP|EXHAUSTED>  <slug>  <YYYY-MM-DD HH:MM>
Objective:    <one line>
Changed:      <bullets>
Gate:         <passed | failed at step>
Commit/Saved: <hash or artifact path>
Why stopped:  <only if not green>
Next:         <one line>

# GATE & TOPOLOGY
The gate is protected by construction, not prose: gate scripts and AXIOMS.md live outside the
agent's write scope and are integrity-checked before each run. The agent may propose gate
changes; only a human approves them. No production credentials or irreversible live actions in
unattended runs. The default loop keeps running until a hard interruption; an optional
cost/time fuse can cap unattended spend when explicitly configured.

Single-agent now: one agent works the loop and commits to main only after the protected gate
passes. The local PowerShell loop is endless by default and only stops on hard interruption;
set `-FuseMinutes` or `CODEX_YOLO_FUSE_MINUTES` when a time cap is wanted. Promoter later:
each agent works a branch, one deterministic promoter re-validates against HEAD and
fast-forwards main. Build the promoter only when you go multi-agent.
