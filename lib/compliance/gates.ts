export function liveMessagingIsBlocked() {
  return process.env.LIVE_MESSAGING_ENABLED !== "true";
}
