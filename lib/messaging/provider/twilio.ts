import type { MessagingProvider, MessageSendInput, MessageSendResult } from "./types";

export class TwilioProviderError extends Error {
  constructor(public code: "PROVIDER_ERROR" | "AUTH_FAILURE" | "RATE_LIMIT_ERROR" | "BAD_REQUEST") {
    super(code);
    this.name = "TwilioProviderError";
  }
}

export const twilioProvider: MessagingProvider = {
  name: "twilio",
  async send(input: MessageSendInput): Promise<MessageSendResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      throw new TwilioProviderError("AUTH_FAILURE");
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      let response: Response;
      try {
        response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: new URLSearchParams({
            To: input.to,
            From: input.from,
            Body: input.body
          }),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new TwilioProviderError("AUTH_FAILURE");
        }
        if (response.status === 429) {
          throw new TwilioProviderError("RATE_LIMIT_ERROR");
        }
        if (response.status >= 400 && response.status < 500) {
          throw new TwilioProviderError("BAD_REQUEST");
        }
        throw new TwilioProviderError("PROVIDER_ERROR");
      }

      const payload = (await response.json().catch(() => ({}))) as {
        sid?: string;
      };

      if (!payload.sid) {
        throw new TwilioProviderError("PROVIDER_ERROR");
      }

      return {
        providerMessageId: payload.sid,
        status: "queued"
      };

    } catch (err) {
      if (err instanceof TwilioProviderError) {
        throw err;
      }
      throw new TwilioProviderError("PROVIDER_ERROR");
    }
  }
};
