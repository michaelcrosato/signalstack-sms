import { createHash } from "node:crypto";

export function messageAttemptEventDeduplicationKey(
  type: string,
  messageId: string,
  attemptId: string,
  providerStatus?: string,
  providerErrorCode?: string | null
): string {
  const digest = createHash("sha256")
    .update(
      `signalstack/message-callback-event/v1\0${type}\0${messageId}\0${attemptId}\0${providerStatus ?? ""}\0${providerErrorCode ?? ""}`,
      "utf8"
    )
    .digest("base64url");
  return `m5:${type}:${digest}`;
}
