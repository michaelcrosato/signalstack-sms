# Architecture

Stack defaults: Next.js App Router, TypeScript strict mode, PostgreSQL, Prisma, Zod, Vitest, Playwright, Tailwind CSS, BullMQ/Redis-ready workers, dummy SMS provider, fake AI provider, and CI validation. [DEFAULT]

Post-MVP local workers support one-shot and opt-in continuous polling modes. Continuous mode is for local/demo execution only and reuses the dummy-provider hard gate before every poll.
