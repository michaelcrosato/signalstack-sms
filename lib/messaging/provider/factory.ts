import { createDummyProvider } from "./dummy-provider";
import { createTwilioProvider, type TwilioProviderDependencies } from "./twilio-provider";
import type { ProviderAdapter, ProviderCredentials } from "./types";

export type ProviderFactoryInput =
  | Readonly<{ name: "dummy" }>
  | Readonly<{ name: "twilio"; credentials: ProviderCredentials }>;

export type ProviderFactoryDependencies = Readonly<{
  twilio?: TwilioProviderDependencies;
}>;

export interface ProviderFactory {
  create(input: ProviderFactoryInput): ProviderAdapter;
}

export function createProviderFactory(
  dependencies: ProviderFactoryDependencies = {}
): ProviderFactory {
  return Object.freeze({
    create(input: ProviderFactoryInput): ProviderAdapter {
      if (input.name === "dummy") {
        return createDummyProvider();
      }
      if (input.name === "twilio") {
        return createTwilioProvider(input.credentials, dependencies.twilio);
      }
      throw new Error("Messaging provider is unsupported.");
    }
  });
}

export const providerFactory = createProviderFactory();
