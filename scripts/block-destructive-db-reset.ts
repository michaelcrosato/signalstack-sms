if (process.env.ALLOW_DESTRUCTIVE_LOCAL_DB_RESET !== "true") {
  console.error("Blocked db:reset. Set ALLOW_DESTRUCTIVE_LOCAL_DB_RESET=true for local-only destructive reset.");
  process.exit(1);
}

console.log("Destructive DB reset is intentionally not implemented in Milestone 0.");
