# Agent Instructions

This repo is governed by docs/CANONICAL_IMPLEMENTATION_PLAN.md.

Read order:
1. docs/CANONICAL_IMPLEMENTATION_PLAN.md
2. PLAN.md if it exists
3. AGENTS.md
4. contracts/**
5. docs/LOCAL_GATE.md if it exists

Operating posture:
- Maximum automation.
- Make reasonable defaults.
- Run install/build/typecheck/lint/test/repair commands automatically.
- Do not ask humans for routine implementation choices.
- Preserve hard gates for live SMS/email/notifications, billing, real secrets, destructive production DB operations, irreversible deletion, compliance-sensitive actions, spam, data leakage, and real financial cost.

Milestone rule:
Start with Milestone 0 only. Do not implement product features until validation, docs, contracts, CI, scripts, and demo-safe defaults exist.
