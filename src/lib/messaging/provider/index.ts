import { dummyProvider } from "./dummy-provider";
import { twilioProvider } from "./twilio-provider";
import type { MessagingProvider, MessagingProviderName } from "./types";

export { dummyProvider } from "./dummy-provider";
export { twilioProvider } from "./twilio-provider";
export type * from "./types";

export function getMessagingProvider(name: MessagingProviderName): MessagingProvider {
  if (name === "twilio") {
    return twilioProvider;
  }
  return dummyProvider;
}
