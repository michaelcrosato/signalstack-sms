import { ConsentStatus, ConversationStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fakeConversationSentiment,
  type AiMessage,
} from "@/lib/ai/fake-ai-provider";
import { liveAiProvider } from "@/lib/ai/provider";
import {
  createDemoInboundMessage,
  createConversationInboundMessage,
} from "@/lib/db/repositories/inbox";
import { prisma } from "@/lib/db/prisma";

const messages: AiMessage[] = [
  {
    direction: "INBOUND",
    body: "Hello, I am interested in pricing and options",
  },
  { direction: "OUTBOUND", body: "Hello! We offer several packages." },
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Conversation Sentiment and AI Categorization Seam", () => {
  describe("fakeConversationSentiment", () => {
    it("identifies pricing questions as POSITIVE and INQUIRY", () => {
      const result = fakeConversationSentiment(messages);
      expect(result).toEqual({
        provider: "fake",
        sentiment: "POSITIVE",
        category: "INQUIRY",
      });
    });

    it("identifies support/help keywords as SUPPORT and NEUTRAL", () => {
      const supportMessages: AiMessage[] = [
        {
          direction: "INBOUND",
          body: "Please help me with setting up my system",
        },
      ];
      const result = fakeConversationSentiment(supportMessages);
      expect(result).toEqual({
        provider: "fake",
        sentiment: "NEUTRAL",
        category: "SUPPORT",
      });
    });

    it("identifies opt-out keywords as NEGATIVE and OPT_OUT", () => {
      const optOutMessages: AiMessage[] = [
        { direction: "INBOUND", body: "stop sending me texts, cancel" },
      ];
      const result = fakeConversationSentiment(optOutMessages);
      expect(result).toEqual({
        provider: "fake",
        sentiment: "NEGATIVE",
        category: "OPT_OUT",
      });
    });

    it("identifies standard greeting as NEUTRAL and SALUTATION", () => {
      const greetingMessages: AiMessage[] = [
        { direction: "INBOUND", body: "Hello there, just wanted to say hi" },
      ];
      const result = fakeConversationSentiment(greetingMessages);
      expect(result).toEqual({
        provider: "fake",
        sentiment: "NEUTRAL",
        category: "SALUTATION",
      });
    });
  });

  describe("liveAiProvider.analyzeConversationSentiment", () => {
    it("correctly calls Anthropic API and parses JSON sentiment analysis", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [
            { text: '{"sentiment": "POSITIVE", "category": "INQUIRY"}' },
          ],
        }),
      });
      vi.stubGlobal("fetch", fetchMock);
      vi.stubEnv("AI_API_KEY", "test-key");

      const result = await liveAiProvider.analyzeConversationSentiment({
        messages,
      });
      expect(result).toEqual({
        provider: "live",
        sentiment: "POSITIVE",
        category: "INQUIRY",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
      expect(url).toBe("https://api.anthropic.com/v1/messages");
      expect(init.body).toContain("POSITIVE|NEGATIVE|NEUTRAL");
    });

    it("throws on an unparseable json response from live AI", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            content: [{ text: "This is not JSON at all." }],
          }),
        }),
      );
      vi.stubEnv("AI_API_KEY", "test-key");

      await expect(
        liveAiProvider.analyzeConversationSentiment({ messages }),
      ).rejects.toThrow(
        "Live AI returned an unparseable conversation sentiment.",
      );
    });
  });

  describe("database integration", () => {
    it("async triggers and updates conversation sentiment/category in createDemoInboundMessage", async () => {
      const org = await prisma.organization.create({
        data: {
          slug: `org-sentiment-${Date.now()}`,
          name: `Org Sentiment-${Date.now()}`,
          demoMode: true,
        },
      });
      const phone = `+1555090${Math.floor(1000 + Math.random() * 9000)}`;

      const result = await createDemoInboundMessage(org.id, {
        phone,
        body: "Can you send details about pricing?",
        providerMessageId: `msg_${Date.now()}`,
      });

      // Initially sentiment/category might be null as the transaction is executing,
      expect(result.conversation).not.toBeNull();
      expect(result.conversation!.sentiment).toBeNull();

      // Wait with polling for async sentiment evaluation
      let updated;
      for (let i = 0; i < 80; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        updated = await prisma.conversation.findUniqueOrThrow({
          where: { id: result.conversation!.id },
        });
        if (updated.sentiment !== null) break;
      }
      expect(updated!.sentiment).toBe("POSITIVE");
      expect(updated!.category).toBe("INQUIRY");
    });

    it("async triggers and updates conversation sentiment/category in createConversationInboundMessage", async () => {
      const org = await prisma.organization.create({
        data: {
          slug: `org-sentiment-conv-${Date.now()}`,
          name: `Org Sentiment Conv-${Date.now()}`,
          demoMode: true,
        },
      });
      const phone = `+1555095${Math.floor(1000 + Math.random() * 9000)}`;

      const contact = await prisma.contact.create({
        data: { orgId: org.id, phone, consentStatus: ConsentStatus.OPTED_IN },
      });

      const conversation = await prisma.conversation.create({
        data: {
          orgId: org.id,
          contactId: contact.id,
          status: ConversationStatus.OPEN,
        },
      });

      await createConversationInboundMessage(org.id, conversation.id, {
        body: "I need support with my account.",
        providerMessageId: `msg_${Date.now()}`,
      });

      // Wait with polling for async sentiment evaluation
      let updated;
      for (let i = 0; i < 80; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        updated = await prisma.conversation.findUniqueOrThrow({
          where: { id: conversation.id },
        });
        if (updated.sentiment !== null) break;
      }
      expect(updated!.sentiment).toBe("NEUTRAL");
      expect(updated!.category).toBe("SUPPORT");
    });
  });
});
